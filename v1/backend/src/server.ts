import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { ExcelService } from './services/excel.service';
import { ToolsService } from './services/tools.service';
import { createToolsRouter } from './routes/tools.routes';
import { createImageRouter } from './routes/image.routes';
import { ApiResponse } from './types/tool';

// Load environment variables
dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3000;
// Excel file is in the root of MakerLab_Tools, not in v1
const EXCEL_FILE_PATH =
  process.env.EXCEL_FILE_PATH || path.join(__dirname, '../../../tools.xlsx');

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from frontend directory
const frontendPath = path.join(__dirname, '../../frontend');
app.use(express.static(frontendPath));

// Initialize services
const excelService = new ExcelService(EXCEL_FILE_PATH);
const toolsService = new ToolsService(excelService);

// Routes
app.use('/api/tools', createToolsRouter(toolsService));
app.use('/api/image', createImageRouter());

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ success: true, status: 'healthy' });
});

// Root route - serve frontend
app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Error handling middleware
app.use(
  (
    err: Error,
    req: Request,
    res: Response,
    next: express.NextFunction
  ) => {
    const response: ApiResponse<never> = {
      success: false,
      error: err.message || 'Internal server error',
    };
    res.status(500).json(response);
  }
);

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Excel file path: ${EXCEL_FILE_PATH}`);
});

