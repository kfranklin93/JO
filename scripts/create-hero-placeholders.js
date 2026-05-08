const fs = require('fs');
const path = require('path');

// Create images directory if it doesn't exist
const imagesDir = path.join(__dirname, '..', 'public', 'images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

// Create simple SVG placeholders that will be saved as .jpg
const createSVGPlaceholder = (width, height, text, bgColor, textColor) => {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${bgColor}"/>
  <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="48" fill="${textColor}" text-anchor="middle" dominant-baseline="middle">
    ${text}
  </text>
</svg>`;
};

// Create joey-hero.jpg placeholder (1200x1600 - portrait)
const heroSVG = createSVGPlaceholder(
  1200, 
  1600, 
  'Joey Oberndorfer Photo', 
  '#e5e5e5', 
  '#666666'
);
fs.writeFileSync(path.join(imagesDir, 'joey-hero.svg'), heroSVG);

// Create joey-office.jpg placeholder (1920x1080 - landscape)
const officeSVG = createSVGPlaceholder(
  1920, 
  1080, 
  'Office Background', 
  '#2a2a2a', 
  '#999999'
);
fs.writeFileSync(path.join(imagesDir, 'joey-office.svg'), officeSVG);

console.log('✅ Hero placeholder images created successfully!');
console.log('   - public/images/joey-hero.svg (1200x1600)');
console.log('   - public/images/joey-office.svg (1920x1080)');
console.log('\n📝 Note: Update component imports to use .svg instead of .jpg');

// Made with Bob
