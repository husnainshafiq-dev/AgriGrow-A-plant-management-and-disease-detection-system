"""
Colab training script for merged plant-disease dataset.

How to use in Google Colab:
1) Upload your dataset folder (or zip) so that /content/dataset contains:
      /content/dataset/train/<class_name>/*.jpg
      /content/dataset/val/<class_name>/*.jpg
      /content/dataset/test/<class_name>/*.jpg
2) Run:
      !python /content/train_colab.py --data-dir /content/dataset --epochs 20
"""

import argparse
import os
from pathlib import Path

import matplotlib.pyplot as plt
import tensorflow as tf
from tensorflow.keras import layers, models
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint, ReduceLROnPlateau


def count_classes(train_dir: Path):
    return sorted([d.name for d in train_dir.iterdir() if d.is_dir()])


def make_datasets(data_dir: Path, img_size=(224, 224), batch_size=32):
    train_dir = data_dir / "train"
    val_dir = data_dir / "val"
    test_dir = data_dir / "test"

    if not train_dir.exists() or not val_dir.exists() or not test_dir.exists():
        raise FileNotFoundError(
            f"Expected train/val/test under {data_dir}, but one or more are missing."
        )

    train_ds = tf.keras.utils.image_dataset_from_directory(
        train_dir,
        labels="inferred",
        label_mode="categorical",
        image_size=img_size,
        batch_size=batch_size,
        shuffle=True,
        seed=42,
    )

    val_ds = tf.keras.utils.image_dataset_from_directory(
        val_dir,
        labels="inferred",
        label_mode="categorical",
        image_size=img_size,
        batch_size=batch_size,
        shuffle=False,
    )

    test_ds = tf.keras.utils.image_dataset_from_directory(
        test_dir,
        labels="inferred",
        label_mode="categorical",
        image_size=img_size,
        batch_size=batch_size,
        shuffle=False,
    )

    class_names = train_ds.class_names

    # Performance optimizations
    autotune = tf.data.AUTOTUNE
    train_ds = train_ds.prefetch(autotune)
    val_ds = val_ds.prefetch(autotune)
    test_ds = test_ds.prefetch(autotune)

    return train_ds, val_ds, test_ds, class_names


def build_model(num_classes: int, img_size=(224, 224), dropout=0.3):
    data_augmentation = tf.keras.Sequential(
        [
            layers.RandomFlip("horizontal"),
            layers.RandomRotation(0.1),
            layers.RandomZoom(0.1),
        ],
        name="augmentation",
    )

    base = MobileNetV2(
        input_shape=(img_size[0], img_size[1], 3),
        include_top=False,
        weights="imagenet",
    )
    base.trainable = False

    inputs = layers.Input(shape=(img_size[0], img_size[1], 3))
    x = data_augmentation(inputs)
    x = tf.keras.applications.mobilenet_v2.preprocess_input(x)
    x = base(x, training=False)
    x = layers.GlobalAveragePooling2D()(x)
    x = layers.Dropout(dropout)(x)
    outputs = layers.Dense(num_classes, activation="softmax")(x)

    model = models.Model(inputs, outputs)
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
        loss="categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model, base


def fine_tune(model, base_model, train_ds, val_ds, epochs=10, unfreeze_from=100):
    base_model.trainable = True
    for layer in base_model.layers[:unfreeze_from]:
        layer.trainable = False

    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=1e-5),
        loss="categorical_crossentropy",
        metrics=["accuracy"],
    )

    history = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=epochs,
        callbacks=[
            EarlyStopping(patience=4, restore_best_weights=True, monitor="val_accuracy"),
            ReduceLROnPlateau(patience=2, factor=0.2, monitor="val_loss"),
        ],
    )
    return history


def plot_history(history, out_dir: Path):
    out_dir.mkdir(parents=True, exist_ok=True)
    hist = history.history
    plt.figure(figsize=(10, 4))
    plt.subplot(1, 2, 1)
    plt.plot(hist.get("accuracy", []), label="train_acc")
    plt.plot(hist.get("val_accuracy", []), label="val_acc")
    plt.legend()
    plt.title("Accuracy")

    plt.subplot(1, 2, 2)
    plt.plot(hist.get("loss", []), label="train_loss")
    plt.plot(hist.get("val_loss", []), label="val_loss")
    plt.legend()
    plt.title("Loss")
    plt.tight_layout()
    plt.savefig(out_dir / "training_curves.png", dpi=160)
    plt.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=str, default="/content/dataset")
    parser.add_argument("--output-dir", type=str, default="/content/model_output")
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--fine-tune-epochs", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--img-size", type=int, default=224)
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    train_ds, val_ds, test_ds, class_names = make_datasets(
        data_dir=data_dir,
        img_size=(args.img_size, args.img_size),
        batch_size=args.batch_size,
    )
    num_classes = len(class_names)
    print(f"Detected {num_classes} classes:")
    for i, c in enumerate(class_names):
        print(f"  {i}: {c}")

    model, base = build_model(num_classes=num_classes, img_size=(args.img_size, args.img_size))
    model.summary()

    checkpoint_path = out_dir / "best_model.keras"
    callbacks = [
        EarlyStopping(patience=5, restore_best_weights=True, monitor="val_accuracy"),
        ReduceLROnPlateau(patience=2, factor=0.2, monitor="val_loss"),
        ModelCheckpoint(filepath=checkpoint_path, monitor="val_accuracy", save_best_only=True),
    ]

    print("\n=== Phase 1: train classifier head ===")
    h1 = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=args.epochs,
        callbacks=callbacks,
    )

    print("\n=== Phase 2: fine-tune backbone ===")
    h2 = fine_tune(
        model=model,
        base_model=base,
        train_ds=train_ds,
        val_ds=val_ds,
        epochs=args.fine_tune_epochs,
        unfreeze_from=100,
    )

    print("\n=== Evaluate on test set ===")
    test_loss, test_acc = model.evaluate(test_ds, verbose=1)
    print(f"Test loss: {test_loss:.4f}")
    print(f"Test acc : {test_acc:.4f}")

    final_model_path = out_dir / "plant_disease_model.keras"
    h5_model_path = out_dir / "plant_disease_model.h5"
    model.save(final_model_path)
    model.save(h5_model_path)

    with open(out_dir / "class_names.txt", "w", encoding="utf-8") as f:
        for c in class_names:
            f.write(c + "\n")

    # Save only phase-1 curve quickly (you can merge histories if needed)
    plot_history(h1, out_dir)

    print("\nSaved:")
    print(" -", checkpoint_path)
    print(" -", final_model_path)
    print(" -", h5_model_path)
    print(" -", out_dir / "class_names.txt")
    print(" -", out_dir / "training_curves.png")


if __name__ == "__main__":
    main()

