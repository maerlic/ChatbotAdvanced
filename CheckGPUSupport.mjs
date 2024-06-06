import * as tf from '@tensorflow/tfjs-node-gpu';

// Check the backend
console.log('TensorFlow backend:', tf.getBackend());

// Create a sample tensor
const tensor = tf.tensor([2, 4, 6, 8]);
console.log('Tensor\n', tensor);