/**
 * Iframe Tab Content Component
 * 
 * Renders an external website in an iframe for technician tabs.
 */

import { useState } from 'react';
import { AlertCircle, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface IframeTabContentProps {
  url: string;
  name: string;
}

export function IframeTabContent({ url, name }: IframeTabContentProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const handleLoad = () => {
    setIsLoading(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  const handleOpenExternal = () => {
    window.open(url, '_blank');
  };

  return (
    <div className="flex-1 w-full h-full flex flex-col relative">
      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading {name}...</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
          <div className="flex flex-col items-center gap-4 text-center max-w-md p-8">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <div>
              <h3 className="font-semibold text-lg mb-2">Unable to load {name}</h3>
              <p className="text-sm text-muted-foreground">
                This website may block embedding or there could be a connection issue.
              </p>
            </div>
            <Button onClick={handleOpenExternal} variant="outline" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Open in Browser
            </Button>
          </div>
        </div>
      )}

      {/* Iframe */}
      <iframe
        src={url}
        title={name}
        className="w-full h-full border-0 flex-1"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  );
}
