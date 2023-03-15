const Generation = require('../stability-ai/generation/generation_pb');
const {
  GenerationServiceClient
} = require('../stability-ai/generation/generation_pb_service');
const { grpc: GRPCWeb } = require('@improbable-eng/grpc-web');
const fs = require('fs');

/** Builds a generation request for a specified engine with the specified parameters. */
exports.buildGenerationRequest = function buildGenerationRequest(
  engineID,
  params
) {
  const imageParams = new Generation.ImageParameters();
  params.width && imageParams.setWidth(params.width);
  params.height && imageParams.setHeight(params.height);
  // Set the number of images to generate (Default 1)
  params.samples && imageParams.setSamples(params.samples);
  // Set the steps (Default 30)
  // Represents the amount of inference steps performed on image generation.
  params.steps && imageParams.setSteps(params.steps);
  // Set the seed (Default 0)
  // Including a seed will cause the results to be deterministic.
  // Omitting the seed or setting it to `0` will do the opposite.
  params.seed && imageParams.addSeed(params.seed);
  // Set the sampler (Default 'automatic')
  // Omitting this value enables 'automatic' mode where we choose the best sampler for you based
  // on the current payload. For example, since CLIP guidance only works on ancestral samplers,
  // when CLIP guidance is enabled, we will automatically choose an ancestral sampler for you.
  if (params.sampler) {
    const transformType = new Generation.TransformType();
    transformType.setDiffusion(params.sampler);
    imageParams.setTransform(transformType);
  }
  // Set the Engine
  // At the time of writing, valid engines are:
  //  stable-diffusion-v1,
  //  stable-diffusion-v1-5
  //  stable-diffusion-512-v2-0
  //  stable-diffusion-768-v2-0
  //  stable-diffusion-512-v2-1
  //  stable-diffusion-768-v2-1
  //  stable-inpainting-v1-0
  //  stable-inpainting-512-v2-0
  const request = new Generation.Request();
  request.setEngineId(engineID);
  request.setRequestedType(Generation.ArtifactType.ARTIFACT_IMAGE);
  request.setClassifier(new Generation.ClassifierParameters());
  // Set the CFG scale (Default 7)
  // Influences how strongly your generation is guided to match your prompt.  Higher values match closer.
  const samplerParams = new Generation.SamplerParameters();
  params.cfgScale && samplerParams.setCfgScale(params.cfgScale);
  const stepParams = new Generation.StepParameter();
  stepParams.setScaledStep(0);
  stepParams.setSampler(samplerParams);
  const scheduleParams = new Generation.ScheduleParameters();
  if (params.type === 'image-to-image') {
    // If we're doing image-to-image generation then we need to configure
    // how much influence the initial image has on the diffusion process
    scheduleParams.setStart(params.stepScheduleStart);
    if (params.stepScheduleEnd) {
      scheduleParams.setEnd(params.stepScheduleEnd);
    }
  } else if (params.type === 'image-to-image-masking') {
    // Step schedule start is always 1 for masking requests
    scheduleParams.setStart(1);
  }
  stepParams.setSchedule(scheduleParams);
  // Set CLIP Guidance (Default: None)
  // NOTE: This only works with ancestral samplers. Omitting the sampler parameter above will ensure
  // that we automatically choose an ancestral sampler for you when CLIP guidance is enabled.
  if (params.clipGuidancePreset) {
    const guidanceParameters = new Generation.GuidanceParameters();
    guidanceParameters.setGuidancePreset(
      Generation.GuidancePreset.GUIDANCE_PRESET_FAST_BLUE
    );
    stepParams.setGuidance(guidanceParameters);
  }
  imageParams.addParameters(stepParams);
  request.setImage(imageParams);
  // Set our text prompts
  params.prompts.forEach((textPrompt) => {
    const prompt = new Generation.Prompt();
    prompt.setText(textPrompt.text);
    // If provided, set the prompt's weight (use negative values for negative weighting)
    if (textPrompt.weight) {
      const promptParameters = new Generation.PromptParameters();
      promptParameters.setWeight(textPrompt.weight);
      prompt.setParameters(promptParameters);
    }
    request.addPrompt(prompt);
  });
  // Add image prompts if we're doing some kind of image-to-image generation
  if (params.type === 'image-to-image') {
    request.addPrompt(createInitImagePrompt(params.initImage));
  } else if (params.type === 'image-to-image-masking') {
    request.addPrompt(createInitImagePrompt(params.initImage));
    request.addPrompt(createMaskImagePrompt(params.maskImage));
  }
  return request;
};
function createInitImagePrompt(imageBinary) {
  const initImageArtifact = new Generation.Artifact();
  initImageArtifact.setBinary(imageBinary);
  initImageArtifact.setType(Generation.ArtifactType.ARTIFACT_IMAGE);
  const initImageParameters = new Generation.PromptParameters();
  initImageParameters.setInit(true);
  const initImagePrompt = new Generation.Prompt();
  initImagePrompt.setParameters(initImageParameters);
  initImagePrompt.setArtifact(initImageArtifact);
  return initImagePrompt;
}
function createMaskImagePrompt(imageBinary) {
  const maskImageArtifact = new Generation.Artifact();
  maskImageArtifact.setBinary(imageBinary);
  maskImageArtifact.setType(Generation.ArtifactType.ARTIFACT_MASK);
  const maskImagePrompt = new Generation.Prompt();
  maskImagePrompt.setArtifact(maskImageArtifact);
  return maskImagePrompt;
}
/** Executes a GenerationRequest, abstracting the gRPC streaming result behind a Promise */
exports.executeGenerationRequest = async function executeGenerationRequest(
  generationClient,
  request,
  metadata
) {
  try {
    const stream = generationClient.generate(request, metadata);
    const answers = await new Promise((resolve, reject) => {
      const answers = new Array();
      stream.on('data', (data) => answers.push(data));
      stream.on('end', () => resolve(answers));
      stream.on('status', (status) => {
        if (status.code === 0) return;
        reject(status.details);
      });
    });
    return extractArtifacts(answers);
  } catch (err) {
    return err instanceof Error ? err : new Error(JSON.stringify(err));
  }
};
function extractArtifacts(answers) {
  const filteredArtifacts = new Array();
  const imageArtifacts = new Array();
  for (const answer of answers) {
    for (const artifact of answer.getArtifactsList()) {
      if (artifact.getType() === Generation.ArtifactType.ARTIFACT_IMAGE) {
        if (artifact.getFinishReason() === Generation.FinishReason.FILTER) {
          // Oh no! We were filtered by the NSFW classifier!
          filteredArtifacts.push(artifact);
        } else {
          // We got an image!
          imageArtifacts.push(artifact);
        }
      }
    }
  }
  return { filteredArtifacts, imageArtifacts };
}
/** Generation completion handler - replace this with your own logic  */
exports.onGenerationComplete = function onGenerationComplete(response) {
  const b64Images = [];

  if (response instanceof Error) {
    console.error('Generation failed', response);
    return;
  }

  console.log(
    `${
      response.imageArtifacts.length + response.filteredArtifacts.length
    } artifacts were generated.`
  );

  // Do something with the filtered artifacts
  if (response.filteredArtifacts.length > 0) {
    console.log(
      `${response.filteredArtifacts.length} artifact` +
        `${response.filteredArtifacts.length === 1 ? 's' : ''}` +
        ` were filtered by the NSFW classifier`
    );
  }

  // Do something with the successful image artifacts
  response.imageArtifacts.forEach((artifact) => {
    const imageData = artifact.getBinary_asU8();
    b64Images.push(Buffer.from(imageData).toString('base64'));

    // try {
    //   fs.writeFileSync(
    //     `image-${artifact.getSeed()}.png`,
    //     Buffer.from(imageData)
    //   );
    // } catch (error) {
    //   console.error('Failed to write resulting image to disk', error);
    // }
  });

  return b64Images;

  // For browser implementations: you could use the `artifact.getBinary_asB64()` method to get a
  // base64 encoded string and then create a data URL from that and display it in an <img> tag.
};
