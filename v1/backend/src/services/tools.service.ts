import { Tool } from '../types/tool';
import { ExcelService } from './excel.service';

export class ToolsService {
  private excelService: ExcelService;

  constructor(excelService: ExcelService) {
    this.excelService = excelService;
  }

  /**
   * Get all tools
   */
  async getAllTools(): Promise<Tool[]> {
    return await this.excelService.getTools();
  }

  /**
   * Search tools by name or purpose (case-insensitive contains match)
   * Matches the Python implementation logic
   */
  async searchTools(query: string): Promise<Tool[]> {
    const allTools = await this.getAllTools();
    const searchTerm = query.toLowerCase().trim();

    if (!searchTerm) {
      return allTools;
    }

    return allTools.filter(
      (tool) =>
        tool.toolName.toLowerCase().includes(searchTerm) ||
        tool.toolPurpose.toLowerCase().includes(searchTerm)
    );
  }
}

