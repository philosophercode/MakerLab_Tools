import { getTool } from '@/lib/api';
import { Chat } from '@/components/Chat';
import { Manuals } from '@/components/Manuals';
import Image from 'next/image';
import Link from 'next/link';

export default async function ToolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let tool = null;
  
  try {
    tool = await getTool(id);
  } catch (e) {
    console.error(e);
  }

  if (!tool) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-gray-500 text-lg">Tool not found</p>
          <Link href="/" className="text-[var(--accent)] hover:underline mt-2 inline-block">
            &larr; Back to tools
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--card-bg)] sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Link 
              href="/" 
              className="flex items-center gap-2 text-gray-500 hover:text-[var(--accent)] transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-sm font-medium">Back</span>
            </Link>
            <div className="h-6 w-px bg-[var(--border)]" />
            <h1 className="text-xl font-bold truncate">{tool.name}</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-120px)]">
          {/* Left Pane: Info & Manuals */}
          <div className="lg:col-span-1 flex flex-col gap-5 overflow-y-auto pr-2">
            <div className="relative h-56 w-full bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden shrink-0 border border-[var(--border)]">
              {tool.images && tool.images.length > 0 ? (
                <Image 
                  src={tool.images[0]} 
                  alt={tool.name} 
                  fill 
                  className="object-cover"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400">
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
            </div>
            
            <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-4">
              <h2 className="font-semibold text-sm uppercase tracking-wide text-gray-500 mb-2">About</h2>
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line text-sm leading-relaxed">
                {tool.description || 'No description available.'}
              </p>
            </div>

            <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] p-4 flex-1">
              <Manuals attachments={tool.manual_attachments} />
            </div>
          </div>

          {/* Right Pane: Chat */}
          <div className="lg:col-span-2 min-h-[500px] lg:min-h-0">
            <Chat toolId={tool.id} toolName={tool.name} />
          </div>
        </div>
      </main>
    </div>
  );
}

