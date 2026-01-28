# GS-OmniShop

**Singapore Product Shortlist** - A universal product visualizer for managing shopping links across multiple e-commerce platforms.

## Features

- 🎨 **Modern Dark UI** - Beautiful glassmorphism design with smooth animations
- 🔗 **Universal Link Parser** - Paste links from any shopping site (Amazon, Flipkart, Myntra, etc.)
- 📱 **Dual View Modes** 
  - Grid View - See all products at once
  - Swipe View - Tinder-style card interface
- 🏷️ **Smart Categorization** - Auto-categorize products into clothes, shoes, and more
- 💾 **Persistent Storage** - SQLite database with caching for fast performance
- 🔍 **Web Scraping** - Automatically extracts product details, images, and prices
- ⚡ **Real-time Updates** - Hot module replacement for smooth development

## Tech Stack

### Frontend
- **React** with Vite
- Vanilla CSS with CSS Variables
- Responsive design with mobile support

### Backend
- **Node.js** with Express
- **Puppeteer** for web scraping
- **SQLite** for data persistence
- **Better-SQLite3** for synchronous database operations

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/YOUR_USERNAME/shopping.git
cd shopping
```

2. Install dependencies for both client and server:
```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### Running the Application

1. Start the server (from the `server` directory):
```bash
cd server
npm run dev
```

2. Start the client (from the `client` directory):
```bash
cd client
npm run dev
```

3. Open your browser and navigate to `http://localhost:5173`

## Usage

1. **Add Products**: Paste shopping URLs or WhatsApp messages containing links into the text area
2. **Upload Files**: Upload .txt, .csv, or .json files containing product links
3. **Switch Views**: Toggle between Grid and Swipe modes
4. **Filter Categories**: Filter products by All, Clothes, or Shoes
5. **Adjust Card Size**: Use the slider to change product card sizes
6. **Delete Products**: Click the × button to remove unwanted products

## API Endpoints

- `POST /api/scrape` - Scrape product data from URLs
- `GET /api/products` - Retrieve all stored products
- `DELETE /api/products/:id` - Delete a specific product

## Project Structure

```
shopping/
├── client/               # React frontend
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── App.jsx       # Main app component
│   │   └── index.css     # Global styles
│   └── package.json
├── server/               # Express backend
│   ├── index.js          # Server entry point
│   ├── scraper.js        # Puppeteer scraping logic
│   └── package.json
└── README.md
```

## Features in Detail

### Web Scraping
The application uses Puppeteer to intelligently scrape product information from various e-commerce sites, extracting:
- Product titles
- Prices
- Images
- Product URLs
- Sizes (where available)

### Smart Caching
Database caching is enabled by default to reduce scraping load and improve performance. Products are stored locally and retrieved instantly on subsequent visits.

### Category Detection
The app automatically categorizes products based on keywords in titles and URLs, making it easy to filter your shortlist.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is open source and available under the MIT License.

## Author

Gaurav Singh
