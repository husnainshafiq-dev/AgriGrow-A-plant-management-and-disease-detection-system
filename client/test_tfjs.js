const tf = require('@tensorflow/tfjs-node');

async function testLoad() {
    try {
        console.log("Loading model...");
        const model = await tf.loadLayersModel('file://d:/model/client/public/model/model.json');
        console.log("Success! Model loaded.", model.summary());
    } catch (err) {
        console.error("TFJS Error loading model:");
        console.error(err);
    }
}
testLoad();
