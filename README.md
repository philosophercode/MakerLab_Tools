# MakerLAB Tools

Welcome to the MakerLAB Tools repository. This project provides a digital catalog and search interface for tools available in the MakerLAB inventory.

## 📂 Repository Structure

This repository contains two versions of the application:

### 1. **v1 (Current Web Application)**
Located in the [`v1/`](./v1) directory. This is the production-ready web application.
- **Stack**: Node.js, Express, TypeScript, Vanilla JavaScript.
- **Features**: Fast search, typeahead suggestions, grid/list views, and optimized image handling.
- **Deployment**: Configured for easy deployment on Vercel.

### 2. **Prototype (Legacy)**
Located in the root directory (`makerlab_app.py`).
- **Stack**: Python, Streamlit.
- **Description**: The initial proof-of-concept for browsing the tool catalog.

---

## 🚀 Getting Started (v1 Web App)

The V1 web application is the recommended version for use.

### Prerequisites
- Node.js (v16+)
- npm

### Quick Start
1. Navigate to the backend directory inside `v1`:
   ```bash
   cd v1/backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
   The app will be running at `http://localhost:3000`.

For full documentation, please refer to the [v1 README](./v1/README.md).

---

## 🐍 Running the Python Prototype

If you need to run the original Streamlit script:

1. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Run the Streamlit app:
   ```bash
   streamlit run makerlab_app.py
   ```

---

## 📊 Data Management

The application uses an Excel file as its database.

- **File**: `tools.xlsx`
- **Location**: Root directory (shared source) and `v1/backend/data/` (deployment copy).
- **Format**:
  - `Tool_Name`: Name of the tool.
  - `Image_URL`: Direct link or Google Drive link to the tool's image.
  - `Tool_Purpose`: Short description of the tool's function.

## License

This project is licensed under the ISC License.

