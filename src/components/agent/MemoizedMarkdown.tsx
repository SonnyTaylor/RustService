/**
 * Memoized Markdown Component
 * 
 * Performance-optimized markdown rendering for streaming chat messages.
 * Splits markdown into blocks and memoizes each block to prevent
 * re-rendering the entire message on each token update.
 * 
 * Based on Vercel AI SDK cookbook pattern.
 */

import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { marked } from 'marked';

/**
 * Parse markdown content into discrete blocks using marked lexer
 */
function parseMarkdownIntoBlocks(markdown: string): string[] {
  if (!markdown) return [];
  
  try {
    const tokens = marked.lexer(markdown);
    return tokens.map(token => token.raw);
  } catch {
    // Fallback: split by double newlines
    return markdown.split(/\n\n+/).filter(Boolean);
  }
}

/**
 * Memoized individual markdown block
 */
const MemoizedMarkdownBlock = memo(
  function MemoizedMarkdownBlock({ content }: { content: string }) {
    return (
      <ReactMarkdown
        components={{
          // Code blocks
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !className && !String(children).includes('\n');

            if (isInline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded bg-muted font-mono text-sm text-foreground"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <div className="relative group rounded-lg overflow-hidden bg-muted/80 border border-border/30 my-2">
                {match?.[1] && (
                  <div className="px-3 py-1.5 border-b border-border/30 bg-muted">
                    <span className="text-xs text-muted-foreground font-mono">{match[1]}</span>
                  </div>
                )}
                <pre className="p-3 overflow-x-auto text-sm">
                  <code className="font-mono text-foreground">{children}</code>
                </pre>
              </div>
            );
          },
          // Prevent double wrapping with pre
          pre({ children }) {
            return <>{children}</>;
          },
          // Lists
          ul({ children }) {
            return <ul className="list-disc list-inside space-y-1 my-2 text-foreground/90">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal list-inside space-y-1 my-2 text-foreground/90">{children}</ol>;
          },
          li({ children }) {
            return <li className="text-sm">{children}</li>;
          },
          // Paragraphs
          p({ children }) {
            return <p className="my-1.5 leading-relaxed text-foreground/90">{children}</p>;
          },
          // Emphasis
          strong({ children }) {
            return <strong className="font-semibold text-foreground">{children}</strong>;
          },
          em({ children }) {
            return <em className="italic">{children}</em>;
          },
          // Headers
          h1({ children }) {
            return <h1 className="text-lg font-bold mt-3 mb-2 text-foreground">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-base font-bold mt-3 mb-1.5 text-foreground">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-sm font-bold mt-2 mb-1 text-foreground">{children}</h3>;
          },
          // Links
          a({ href, children }) {
            return (
              <a
                href={href}
                className="text-primary underline underline-offset-2 hover:text-primary/80"
                target="_blank"
                rel="noopener noreferrer"
              >
                {children}
              </a>
            );
          },
          // Blockquotes
          blockquote({ children }) {
            return (
              <blockquote className="border-l-2 border-border pl-3 my-2 italic text-muted-foreground">
                {children}
              </blockquote>
            );
          },
          // Horizontal rules
          hr() {
            return <hr className="my-3 border-border" />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    );
  },
  (prevProps, nextProps) => {
    // Only re-render if content changed
    return prevProps.content === nextProps.content;
  }
);

MemoizedMarkdownBlock.displayName = 'MemoizedMarkdownBlock';

interface MemoizedMarkdownProps {
  /** The markdown content to render */
  content: string;
  /** Unique ID for keying blocks (e.g., message ID) */
  id: string;
}

/**
 * Memoized Markdown Component
 * 
 * Splits markdown into blocks and renders each block with memoization.
 * This prevents re-rendering all blocks when new content is streamed.
 */
export const MemoizedMarkdown = memo(function MemoizedMarkdown({ 
  content, 
  id 
}: MemoizedMarkdownProps) {
  const blocks = useMemo(() => parseMarkdownIntoBlocks(content), [content]);

  if (!content) return null;

  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      {blocks.map((block, index) => (
        <MemoizedMarkdownBlock 
          key={`${id}-block-${index}`} 
          content={block} 
        />
      ))}
    </div>
  );
});

MemoizedMarkdown.displayName = 'MemoizedMarkdown';

export default MemoizedMarkdown;


