const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'assets');
const sourceImagePath = path.join(assetsDir, 'source-image.png');

// Ensure assets directory exists
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// Check if source image exists
if (!fs.existsSync(sourceImagePath)) {
  console.error(`Error: Source image not found at ${sourceImagePath}`);
  process.exit(1);
}

// Create icon from source image
async function createIcon(size, outputPath) {
  await sharp(sourceImagePath)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(outputPath);
}

// Create adaptive icon with white background
async function createAdaptiveIcon(size, outputPath) {
  // Resize the source image to fit within the icon (with some padding)
  const iconSize = size;
  const padding = Math.round(size * 0.1); // 10% padding
  const imageSize = size - (padding * 2);
  
  // Create a white background
  const background = sharp({
    create: {
      width: iconSize,
      height: iconSize,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  });
  
  // Resize source image
  const resizedImage = await sharp(sourceImagePath)
    .resize(imageSize, imageSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();
  
  // Composite the resized image onto the white background
  await background
    .composite([{
      input: resizedImage,
      top: padding,
      left: padding
    }])
    .png()
    .toFile(outputPath);
}

// Create splash screen - center the image on white background
async function createSplash(outputPath) {
  const splashWidth = 1242;
  const splashHeight = 2436;
  
  // Get source image dimensions to calculate scaling
  const sourceMetadata = await sharp(sourceImagePath).metadata();
  const sourceAspectRatio = sourceMetadata.width / sourceMetadata.height;
  const splashAspectRatio = splashWidth / splashHeight;
  
  let imageWidth, imageHeight;
  if (sourceAspectRatio > splashAspectRatio) {
    // Source is wider - fit to width
    imageWidth = splashWidth * 0.8; // 80% of splash width
    imageHeight = imageWidth / sourceAspectRatio;
  } else {
    // Source is taller - fit to height
    imageHeight = splashHeight * 0.6; // 60% of splash height
    imageWidth = imageHeight * sourceAspectRatio;
  }
  
  // Create white background
  const background = sharp({
    create: {
      width: splashWidth,
      height: splashHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  });
  
  // Resize source image
  const resizedImage = await sharp(sourceImagePath)
    .resize(Math.round(imageWidth), Math.round(imageHeight), {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();
  
  // Center the image on the splash screen
  const top = Math.round((splashHeight - imageHeight) / 2);
  const left = Math.round((splashWidth - imageWidth) / 2);
  
  // Composite the resized image onto the white background
  await background
    .composite([{
      input: resizedImage,
      top: top,
      left: left
    }])
    .png()
    .toFile(outputPath);
}

// Create favicon from source image
async function createFavicon(outputPath) {
  await sharp(sourceImagePath)
    .resize(48, 48, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(outputPath);
}

async function generateAssets() {
  console.log('Generating app assets from source-image.png...');
  
  try {
    // Generate icon.png (1024x1024)
    await createIcon(1024, path.join(assetsDir, 'icon.png'));
    console.log('✓ Created icon.png (1024x1024)');
    
    // Generate adaptive-icon.png (1024x1024 with white background)
    await createAdaptiveIcon(1024, path.join(assetsDir, 'adaptive-icon.png'));
    console.log('✓ Created adaptive-icon.png (1024x1024 with white background)');
    
    // Generate splash.png
    await createSplash(path.join(assetsDir, 'splash.png'));
    console.log('✓ Created splash.png (1242x2436)');
    
    // Generate favicon.png
    await createFavicon(path.join(assetsDir, 'favicon.png'));
    console.log('✓ Created favicon.png (48x48)');
    
    console.log('\nAll assets generated successfully from source-image.png!');
  } catch (error) {
    console.error('Error generating assets:', error);
    process.exit(1);
  }
}

generateAssets();

