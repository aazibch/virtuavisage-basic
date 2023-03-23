# VirtuaVisage

A full-stack application for AI enthusiasts, VirtuaVisage allows users to:

- Generate artifacts using the Stable Diffusion deep learning, text-to-image model.
- Share the artifacts with the community.

Stability AI's JavaScript gRPC client is used to generate and fetch the artifacts, while Cloudinary's SDK is utilized to store the artifacts, and MongoDB is used as the database.

## Demo

The demo can be accessed at https://virtuavisage-basic.netlify.app/.

## Scripts

Install server dependencies:

    cd server
    npm install

Install client dependencies:

    cd client
    npm install

Run the server in development mode:

    cd server
    npm run dev

Run the server in production mode:

    cd server
    npm start

Run the client in development mode:

    cd client
    npm run dev

Build the client for production:

    cd client
    npm run build

Preview the client build:

    cd client
    npm run preview
