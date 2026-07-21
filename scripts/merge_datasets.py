import argparse
import os
import random
import shutil
from collections import defaultdict


IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".gif", ".webp", ".tif", ".tiff"}


def is_image_file(name: str) -> bool:
    return os.path.splitext(name)[1].lower() in IMAGE_EXTS


def find_class_dirs(source_root: str):
    """
    Return mapping: class_name -> [absolute image paths]
    Supports:
      - class-folder datasets (root/class/*.jpg)
      - nested duplicate roots (e.g. PlantVillage/PlantVillage/class/*.JPG)
      - split datasets under train/test/val folders
    """
    class_to_files = defaultdict(list)
    split_names = {"train", "test", "val", "valid", "validation"}

    if not os.path.isdir(source_root):
        return class_to_files

    # If this root contains train/test/val, read classes from each split.
    entries = [e for e in os.listdir(source_root) if os.path.isdir(os.path.join(source_root, e))]
    lower_entries = {e.lower() for e in entries}
    has_split = bool(lower_entries & split_names)

    if has_split:
        for split in entries:
            split_path = os.path.join(source_root, split)
            if not os.path.isdir(split_path):
                continue
            for cls in os.listdir(split_path):
                cls_path = os.path.join(split_path, cls)
                if not os.path.isdir(cls_path):
                    continue
                for root, _, files in os.walk(cls_path):
                    for f in files:
                        if is_image_file(f):
                            class_to_files[cls].append(os.path.join(root, f))
        return class_to_files

    # Otherwise, discover leaf directories containing images and use folder name as class.
    for root, dirs, files in os.walk(source_root):
        image_files = [f for f in files if is_image_file(f)]
        if not image_files:
            continue
        cls_name = os.path.basename(root)
        for f in image_files:
            class_to_files[cls_name].append(os.path.join(root, f))

    return class_to_files


def ensure_split_dirs(dataset_root: str, class_names):
    for split in ("train", "val", "test"):
        for cls in class_names:
            os.makedirs(os.path.join(dataset_root, split, cls), exist_ok=True)


def unique_dest_path(dest_dir: str, src_path: str, source_tag: str):
    base_name = os.path.basename(src_path)
    stem, ext = os.path.splitext(base_name)
    candidate = f"{source_tag}__{stem}{ext.lower()}"
    dest_path = os.path.join(dest_dir, candidate)
    idx = 1
    while os.path.exists(dest_path):
        candidate = f"{source_tag}__{stem}__{idx}{ext.lower()}"
        dest_path = os.path.join(dest_dir, candidate)
        idx += 1
    return dest_path


def split_counts(total: int, train_ratio: float, val_ratio: float):
    train_n = int(total * train_ratio)
    val_n = int(total * val_ratio)
    test_n = total - train_n - val_n
    return train_n, val_n, test_n


def merge_sources(
    dataset_root: str,
    source_paths,
    train_ratio: float,
    val_ratio: float,
    seed: int,
):
    random.seed(seed)
    summary = {}

    all_class_files = defaultdict(list)
    source_tags = {}

    for src in source_paths:
        if not os.path.isdir(src):
            continue
        tag = os.path.basename(os.path.normpath(src)).replace(" ", "_")
        source_tags[src] = tag
        class_map = find_class_dirs(src)
        for cls, files in class_map.items():
            for p in files:
                all_class_files[cls].append((p, tag))

    if not all_class_files:
        return summary

    ensure_split_dirs(dataset_root, all_class_files.keys())

    for cls, file_items in all_class_files.items():
        random.shuffle(file_items)
        total = len(file_items)
        train_n, val_n, test_n = split_counts(total, train_ratio, val_ratio)

        chunks = {
            "train": file_items[:train_n],
            "val": file_items[train_n:train_n + val_n],
            "test": file_items[train_n + val_n:],
        }

        copied = {"train": 0, "val": 0, "test": 0, "total": total}
        for split, items in chunks.items():
            dest_dir = os.path.join(dataset_root, split, cls)
            for src_path, source_tag in items:
                dest_path = unique_dest_path(dest_dir, src_path, source_tag)
                shutil.copy2(src_path, dest_path)
                copied[split] += 1

        summary[cls] = copied

    return summary


def count_existing(dataset_root: str):
    counts = {}
    for split in ("train", "val", "test"):
        split_path = os.path.join(dataset_root, split)
        split_counts_map = {}
        if os.path.isdir(split_path):
            for cls in os.listdir(split_path):
                cls_path = os.path.join(split_path, cls)
                if os.path.isdir(cls_path):
                    n = 0
                    for _, _, files in os.walk(cls_path):
                        n += sum(1 for f in files if is_image_file(f))
                    split_counts_map[cls] = n
        counts[split] = split_counts_map
    return counts


def main():
    parser = argparse.ArgumentParser(
        description="Merge one or more class-folder datasets into existing train/val/test folders."
    )
    parser.add_argument(
        "--dataset-root",
        default=r"d:\model\dataset",
        help="Root folder containing train/val/test.",
    )
    parser.add_argument(
        "--sources",
        nargs="+",
        default=[
            r"d:\model\archive",
            r"d:\model\archive one",
            r"d:\model\archive two",
            r"d:\model\archive_one",
            r"d:\model\archive_two",
        ],
        help="Source dataset folders to merge.",
    )
    parser.add_argument("--train-ratio", type=float, default=0.70)
    parser.add_argument("--val-ratio", type=float, default=0.15)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    if args.train_ratio <= 0 or args.val_ratio < 0 or (args.train_ratio + args.val_ratio) >= 1:
        raise ValueError("Invalid split ratios. Need train>0, val>=0, and train+val<1.")

    print("=== Existing dataset counts (before) ===")
    before = count_existing(args.dataset_root)
    for split in ("train", "val", "test"):
        total = sum(before[split].values())
        print(f"{split}: {total} images across {len(before[split])} classes")

    valid_sources = [s for s in args.sources if os.path.isdir(s)]
    print("\n=== Sources found ===")
    if not valid_sources:
        print("No source folders found. Nothing to merge.")
        return
    for s in valid_sources:
        print("-", s)

    summary = merge_sources(
        dataset_root=args.dataset_root,
        source_paths=valid_sources,
        train_ratio=args.train_ratio,
        val_ratio=args.val_ratio,
        seed=args.seed,
    )

    print("\n=== Merge summary (newly copied from sources) ===")
    if not summary:
        print("No classes/images found to merge.")
    else:
        for cls in sorted(summary.keys()):
            x = summary[cls]
            print(
                f"{cls}: total={x['total']} -> "
                f"train={x['train']}, val={x['val']}, test={x['test']}"
            )

    print("\n=== Dataset counts (after) ===")
    after = count_existing(args.dataset_root)
    for split in ("train", "val", "test"):
        total = sum(after[split].values())
        print(f"{split}: {total} images across {len(after[split])} classes")


if __name__ == "__main__":
    main()

