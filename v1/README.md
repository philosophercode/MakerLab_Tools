# MakerLAB Tool Finder v1

A web application for searching and browsing tools from the MakerLAB inventory. The application consists of a TypeScript/Express backend and a vanilla JavaScript frontend.

## Features

- 🔍 **Search Tools**: Search by tool name or purpose with real-time results
- 📋 **View Modes**: Toggle between grid and list view
- 🔤 **Typeahead**: Autocomplete suggestions as you type
- 🖼️ **Image Display**: View tool images with automatic CORS handling
- ⚡ **Fast Performance**: Cached Excel data and optimized search

## Project Structure

```
v1/
├── backend/          # TypeScript/Express backend
│   ├── src/
│   │   ├── routes/   # API route handlers
│   │   ├── services/ # Business logic services
│   │   ├── types/    # TypeScript type definitions
│   │   ├── utils/    # Utility functions
│   │   └── server.ts # Main server file
│   ├── package.json
│   └── tsconfig.json
└── frontend/         # Vanilla JavaScript frontend
    ├── index.html
    ├── app.js
    └── styles.css
```

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Excel file (`tools.xlsx`) in the root of `MakerLab_Tools` directory

## Installation

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Configuration

The application uses environment variables for configuration. Create a `.env` file in the `backend` directory (optional):

```env
PORT=3000
EXCEL_FILE_PATH=../../../tools.xlsx
```

If not provided, defaults are:
- `PORT`: 3000
- `EXCEL_FILE_PATH`: `../../../tools.xlsx` (relative to compiled server.js)

## Running the Application

### Development Mode

Run the server with hot-reload:
```bash
npm run dev
```

### Production Mode

1. Build the TypeScript code:
   ```bash
   npm run build
   ```

2. Start the server:
   ```bash
   npm start
   ```

The application will be available at `http://localhost:3000`

## API Endpoints

### `GET /api/tools`
Get all tools or search for tools.

**Query Parameters:**
- `q` (optional): Search query to filter tools by name or purpose

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "tool-1",
      "toolName": "3D Printer",
      "imageUrl": "https://...",
      "toolPurpose": "Print 3D objects"
    }
  ],
  "count": 1
}
```

### `GET /api/image?url=IMAGE_URL`
Proxy images to avoid CORS issues.

**Query Parameters:**
- `url` (required): URL of the image to proxy

**Response:** Image file with appropriate headers

### `GET /api/health`
Health check endpoint.

**Response:**
```json
{
  "success": true,
  "status": "healthy"
}
```

## Excel File Format

The Excel file (`tools.xlsx`) must contain the following columns:

- `Tool_Name`: Name of the tool
- `Image_URL`: URL to the tool's image (supports Google Drive links)
- `Tool_Purpose`: Description of what the tool is used for

## Technologies Used

### Backend
- **Express.js**: Web framework
- **TypeScript**: Type-safe JavaScript
- **ExcelJS**: Excel file parsing
- **CORS**: Cross-origin resource sharing
- **dotenv**: Environment variable management

### Frontend
- **Vanilla JavaScript**: No framework dependencies
- **HTML5**: Semantic markup
- **CSS3**: Styling and responsive design

## Development

### Type Checking
```bash
npm run type-check
```

### Project Structure

- **Routes** (`src/routes/`): Define API endpoints
- **Services** (`src/services/`): Business logic and data access
- **Types** (`src/types/`): TypeScript interfaces and types
- **Utils** (`src/utils/`): Helper functions (e.g., drive link formatting)

## Features in Detail

### Search Functionality
- Case-insensitive search
- Searches both tool name and purpose
- Debounced input for performance
- Real-time typeahead suggestions

### Image Handling
- Automatic Google Drive link formatting
- CORS proxy for external images
- Redirect handling for image URLs
- Fallback placeholder images

### View Modes
- **Grid View**: Card-based layout with images
- **List View**: Compact list with thumbnails
- View preference saved in localStorage

## Troubleshooting

### Excel File Not Found
Ensure `tools.xlsx` exists in the root `MakerLab_Tools` directory, or set `EXCEL_FILE_PATH` in your `.env` file.

### Images Not Loading
The image proxy handles CORS issues automatically. If images still fail to load, check:
- Image URLs are valid
- Network connectivity
- Image server accessibility

### Port Already in Use
Change the `PORT` environment variable or stop the process using port 3000.

## License

ISC

