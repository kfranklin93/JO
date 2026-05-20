#!/bin/bash

# JOEY UPDATE: Script to create placeholder images for new sections
# Run this to generate placeholder images for testimonials and neighborhoods

# Create directories
mkdir -p public/images/testimonials
mkdir -p public/images/neighborhoods

# Create testimonial placeholder images (simple colored squares)
for i in {1..6}; do
  convert -size 400x400 xc:"#E5E5E5" \
    -gravity center \
    -pointsize 48 \
    -fill "#666666" \
    -annotate +0+0 "Client $i" \
    public/images/testimonials/client-$i.jpg 2>/dev/null || \
  echo "<!-- Placeholder for Client $i -->" > public/images/testimonials/client-$i.jpg
done

# Create neighborhood placeholder images
neighborhoods=("midtown" "buckhead" "east-cobb" "roswell" "kennesaw" "smyrna")
for neighborhood in "${neighborhoods[@]}"; do
  convert -size 1200x900 xc:"#E5E5E5" \
    -gravity center \
    -pointsize 72 \
    -fill "#666666" \
    -annotate +0+0 "${neighborhood^}" \
    public/images/neighborhoods/$neighborhood.jpg 2>/dev/null || \
  echo "<!-- Placeholder for $neighborhood -->" > public/images/neighborhoods/$neighborhood.jpg
done

echo "Placeholder images created successfully!"
echo "Note: If ImageMagick is not installed, placeholder files were created but may not display properly."
echo "Install ImageMagick with: brew install imagemagick (macOS) or apt-get install imagemagick (Linux)"

# Made with Bob
