import * as ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';
import { Tool } from '../types/tool';
import { formatDriveLink } from '../utils/drive-link-formatter';

export class ExcelService {
  private excelFilePath: string;
  private cachedTools: Tool[] | null = null;

  constructor(excelFilePath: string) {
    this.excelFilePath = path.resolve(excelFilePath);
  }

  /**
   * Read and parse Excel file into Tool objects
   * Using ExcelJS - secure and actively maintained
   */
  async readToolsFromExcel(): Promise<Tool[]> {
    // Check if file exists
    if (!fs.existsSync(this.excelFilePath)) {
      throw new Error(`Excel file not found: ${this.excelFilePath}`);
    }

    try {
      // Read Excel file using ExcelJS
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(this.excelFilePath);

      // Get first worksheet
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        throw new Error('Excel file has no worksheets');
      }

      // Convert to array of objects
      const data: Record<string, any>[] = [];
      const headers: Record<number, string> = {};

      // Get headers from first row
      const headerRow = worksheet.getRow(1);
      headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const headerValue = cell.value?.toString() || '';
        if (headerValue.trim()) {
          headers[colNumber] = headerValue.trim();
        }
      });

      // Get data rows
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header row

        const rowData: Record<string, any> = {};
        let hasData = false;

        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const header = headers[colNumber];
          if (header) {
            let value = '';

            // For hyperlinks, prefer the hyperlink URL over the cell value
            if (cell.hyperlink) {
              if (typeof cell.hyperlink === 'string') {
                value = cell.hyperlink.trim();
              } else if (typeof cell.hyperlink === 'object') {
                const hyperlinkObj = cell.hyperlink as any;
                if (hyperlinkObj.address) {
                  value = String(hyperlinkObj.address).trim();
                } else if (hyperlinkObj.text) {
                  value = String(hyperlinkObj.text).trim();
                }
              }
            }

            // If we didn't get a value from hyperlink, use cell value
            if (!value) {
              // Fall back to cell value
              const cellValue = cell.value;
              if (cellValue !== null && cellValue !== undefined) {
                if (typeof cellValue === 'object') {
                  // ExcelJS can return objects for formulas, rich text, hyperlinks, etc.
                  // Check for rich text (has 'richText' property)
                  if ('richText' in cellValue && Array.isArray((cellValue as any).richText)) {
                    value = (cellValue as any).richText
                      .map((rt: any) => rt.text || '')
                      .join('')
                      .trim();
                  }
                  // Check for hyperlink object (has 'text' property)
                  else if ('text' in cellValue) {
                    value = String((cellValue as any).text).trim();
                  }
                  // Check for formula result (has 'result' property)
                  else if ('result' in cellValue) {
                    value = String((cellValue as any).result).trim();
                  }
                  // Check for error (has 'error' property)
                  else if ('error' in cellValue) {
                    value = String((cellValue as any).error).trim();
                  }
                  // Date object
                  else if (cellValue instanceof Date) {
                    value = cellValue.toISOString();
                  }
                  // Fallback: try toString
                  else {
                    value = String(cellValue).trim();
                  }
                } else {
                  value = String(cellValue).trim();
                }
              }
            }

            rowData[header] = value;
            if (value) {
              hasData = true;
            }
          }
        });

        // Only add row if it has at least one non-empty value
        if (hasData) {
          data.push(rowData);
        }
      });

      // Validate required columns
      const requiredCols = ['Tool_Name', 'Image_URL', 'Tool_Purpose'];
      if (data.length > 0) {
        const firstRow = data[0] as Record<string, any>;
        const missingCols = requiredCols.filter(
          (col) => !(col in firstRow)
        );
        if (missingCols.length > 0) {
          throw new Error(
            `Missing required columns: ${missingCols.join(', ')}`
          );
        }
      }

      // Convert to Tool objects
      const tools: Tool[] = data.map((row: any, index: number) => {
        const tool: Tool = {
          id: `tool-${index + 1}`,
          toolName: String(row.Tool_Name || '').trim(),
          imageUrl: formatDriveLink(row.Image_URL),
          toolPurpose: String(row.Tool_Purpose || '').trim(),
        };
        return tool;
      });

      return tools;
    } catch (error) {
      console.error('Error reading Excel file:', error);
      throw new Error(
        `Failed to read Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get tools with caching
   */
  async getTools(): Promise<Tool[]> {
    if (this.cachedTools === null) {
      this.cachedTools = await this.readToolsFromExcel();
    }
    return this.cachedTools;
  }

  /**
   * Clear cache (useful for reloading data)
   */
  clearCache(): void {
    this.cachedTools = null;
  }
}

