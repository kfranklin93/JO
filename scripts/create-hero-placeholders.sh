#!/bin/bash

# Create images directory if it doesn't exist
mkdir -p public/images

# Create joey-hero.jpg placeholder (1200x1600 - portrait for split screen)
# Simple solid color placeholder
magick -size 1200x1600 xc:'#e5e5e5' public/images/joey-hero.jpg

# Create joey-office.jpg placeholder (1920x1080 - landscape for background)
# Simple solid color placeholder
magick -size 1920x1080 xc:'#2a2a2a' public/images/joey-office.jpg

echo "✅ Hero placeholder images created successfully!"
echo "   - public/images/joey-hero.jpg (1200x1600)"
echo "   - public/images/joey-office.jpg (1920x1080)"
echo ""
echo "📝 Note: These are simple solid color placeholders."
echo "   Replace with actual photos when available."

# Made with Bob
