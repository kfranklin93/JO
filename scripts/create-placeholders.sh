#!/bin/bash

# Create placeholder images for Joey O real estate site

# Hero images
cat > public/images/hero/joey-profile.jpg << 'EOF'
<svg width="800" height="1000" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="1000" fill="#A38A75"/>
  <text x="50%" y="50%" text-anchor="middle" fill="white" font-size="32" font-family="Arial">Joey Profile</text>
</svg>
EOF

# Property images
cat > public/images/properties/flagship.jpg << 'EOF'
<svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="800" fill="#043927"/>
  <text x="50%" y="50%" text-anchor="middle" fill="white" font-size="32" font-family="Arial">Flagship Property</text>
</svg>
EOF

cat > public/images/properties/now-selling.jpg << 'EOF'
<svg width="1200" height="900" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="900" fill="#A38A75"/>
  <text x="50%" y="50%" text-anchor="middle" fill="white" font-size="32" font-family="Arial">Now Selling</text>
</svg>
EOF

cat > public/images/properties/future-visions.jpg << 'EOF'
<svg width="1200" height="900" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="900" fill="#B3A394"/>
  <text x="50%" y="50%" text-anchor="middle" fill="white" font-size="32" font-family="Arial">Future Visions</text>
</svg>
EOF

cat > public/images/properties/legacy.jpg << 'EOF'
<svg width="1200" height="900" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="900" fill="#666"/>
  <text x="50%" y="50%" text-anchor="middle" fill="white" font-size="32" font-family="Arial">Legacy Portfolio</text>
</svg>
EOF

# Lifestyle images
for name in marietta-square kennesaw-mountain schools commute coffee; do
  cat > "public/images/lifestyle/${name}.jpg" << EOF
<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="600" fill="#043927"/>
  <text x="50%" y="50%" text-anchor="middle" fill="white" font-size="24" font-family="Arial">${name}</text>
</svg>
EOF
done

# Legacy property images (B&W and color versions)
for i in {1..6}; do
  # B&W version
  cat > "public/images/legacy/property-${i}.jpg" << EOF
<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="600" fill="#888"/>
  <text x="50%" y="50%" text-anchor="middle" fill="white" font-size="24" font-family="Arial">Property ${i} (B&W)</text>
</svg>
EOF
  
  # Color version
  cat > "public/images/legacy/property-${i}-color.jpg" << EOF
<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="600" fill="#A38A75"/>
  <text x="50%" y="50%" text-anchor="middle" fill="white" font-size="24" font-family="Arial">Property ${i} (Color)</text>
</svg>
EOF
done

# Video placeholder
cat > public/videos/hero-drone.mp4 << 'EOF'
# This is a placeholder for the hero video
# Replace with actual drone footage
EOF

echo "✅ All placeholder images created successfully!"

# Made with Bob
