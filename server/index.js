require('dotenv').config();
const path = require('path');
const mongoose = require('mongoose');
const express = require('express');
const cors = require('cors');

const postRoutes = require('./routes/postRoutes.js');
const stableDiffusionRoutes = require('./routes/stableDiffusionRoutes.js');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use('/api/v1/post', postRoutes);
app.use('/api/v1/stable-diffusion', stableDiffusionRoutes);

mongoose
  .connect(process.env.MONGODB_URL)
  .then(() => console.log('Connected to the database.'));

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Server running on port ${port}.`);
});
