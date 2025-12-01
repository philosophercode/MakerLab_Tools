import { Router, Request, Response } from 'express';
import { ToolsService } from '../services/tools.service';
import { ApiResponse, Tool } from '../types/tool';

export function createToolsRouter(toolsService: ToolsService): Router {
  const router = Router();

  /**
   * GET /api/tools
   * Query params: ?q=searchterm (optional)
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const searchQuery = req.query.q as string | undefined;
      let tools: Tool[];
      let count: number;

      if (searchQuery) {
        tools = await toolsService.searchTools(searchQuery);
        count = tools.length;
      } else {
        tools = await toolsService.getAllTools();
        count = tools.length;
      }

      const response: ApiResponse<Tool[]> = {
        success: true,
        data: tools,
        count: count,
      };

      res.json(response);
    } catch (error) {
      console.error('Error in /api/tools:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const response: ApiResponse<never> = {
        success: false,
        error: errorMessage,
      };
      res.status(500).json(response);
    }
  });

  return router;
}

