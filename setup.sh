#!/bin/bash

echo "🚀 Setting up Scrum Poker TypeScript + Vite project..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Type check
echo "🔍 Type checking..."
npm run type-check
npm run type-check:server

# Build client
echo "🏗️ Building client..."
npm run build:client

# Build server
echo "🏗️ Building server..."
npm run build:server

echo "✅ Setup complete!"
echo ""
echo "🎯 To start development:"
echo "  npm run dev"
echo ""
echo "🎯 To start production:"
echo "  npm run build && npm start"