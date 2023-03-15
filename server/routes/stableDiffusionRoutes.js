const express = require('express');
const router = express.Router();

// Initialize client
const Generation = require('../stability-ai/generation/generation_pb');
const {
  GenerationServiceClient
} = require('../stability-ai/generation/generation_pb_service');
const { grpc: GRPCWeb } = require('@improbable-eng/grpc-web');
const {
  NodeHttpTransport
} = require('@improbable-eng/grpc-web-node-http-transport');

GRPCWeb.setDefaultTransport(NodeHttpTransport());
const metadata = new GRPCWeb.Metadata();
metadata.set('Authorization', 'Bearer ' + process.env.STABILITY_API_KEY);

const client = new GenerationServiceClient('https://grpc.stability.ai', {});

// Make the request
const {
  buildGenerationRequest,
  executeGenerationRequest,
  onGenerationComplete
} = require('../utils/stabilityHelpers');

router.route('/').post(async (req, res) => {
  const { prompt } = req.body;
  try {
    const request = buildGenerationRequest('stable-diffusion-768-v2-1', {
      type: 'text-to-image',
      prompts: [
        {
          text: prompt
        }
      ],
      width: 768,
      height: 768,
      samples: 1,
      cfgScale: 13,
      steps: 30,
      sampler: Generation.DiffusionSampler.SAMPLER_K_DPMPP_2M
    });

    const response = await executeGenerationRequest(client, request, metadata);
    const base64Photos = onGenerationComplete(response);

    res.json({ photo: base64Photos[0] });
  } catch (error) {
    res.status(500).send(error?.response.data.error.message);
  }
});

module.exports = router;
