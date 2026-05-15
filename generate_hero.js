require('dotenv').config({ path: '.env.local' });
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('오류: .env.local 파일에 GEMINI_API_KEY가 설정되지 않았습니다.');
  process.exit(1);
}

const PROMPT = `
A warm and charming logo-style illustration of a dog and a cat playing together joyfully.
The dog (golden retriever) and cat (orange tabby) are running and leaping playfully side by side,
both looking happy and full of energy.

Style:
- Logo-like composition: clean, bold, centered, well-balanced.
- Warm color palette: golden yellow, soft orange, cream, peach, with small pink and coral accents.
- Flat cartoon illustration with soft rounded shapes and gentle shading.
- Cozy and heartwarming atmosphere — like a sunny afternoon in a meadow.
- Small details: floating paw prints, tiny hearts, soft sunlight rays in the background.
- The overall image feels like a friendly brand mascot or a pet shelter logo.
- No text. No humans. Just the dog and cat as the main subjects.
- Square or slightly wide composition.
`;

async function generateHeroImage() {
  const ai = new GoogleGenAI({ apiKey: API_KEY });

  console.log('히어로 이미지 생성 중...');

  try {
    const response = await ai.models.generateImages({
      model: 'imagen-3.0-generate-008',
      prompt: PROMPT,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/png',
        aspectRatio: '16:9',
      },
    });

    if (!response.generatedImages || response.generatedImages.length === 0) {
      throw new Error('이미지가 생성되지 않았습니다.');
    }

    const imageBytes = Buffer.from(
      response.generatedImages[0].image.imageBytes,
      'base64'
    );

    const outputPath = path.join(__dirname, 'hero_generated.png');
    fs.writeFileSync(outputPath, imageBytes);
    console.log(`완료! 이미지 저장됨: ${outputPath}`);

  } catch (err) {
    console.error('오류 발생:', err.message);
    process.exit(1);
  }
}

generateHeroImage();
