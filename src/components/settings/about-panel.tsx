/**
 * About Panel Component
 *
 * Application version info, credits, and feature highlights.
 */

import {
  Settings,
  Heart,
  Github,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

export function AboutPanel() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-semibold mb-1">About</h3>
        <p className="text-muted-foreground">
          Information about RustService
        </p>
      </div>

      {/* App Info & Build Info - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              RustService
            </CardTitle>
            <CardDescription>Windows Desktop Toolkit</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-xs text-muted-foreground mb-1">Version</div>
                <code className="font-mono font-semibold">0.1.0</code>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-xs text-muted-foreground mb-1">Platform</div>
                <span className="font-semibold text-sm">Windows 10/11</span>
              </div>
            </div>
            <Separator />
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Tauri 2.0</Badge>
              <Badge variant="outline">React 19</Badge>
              <Badge variant="outline">Rust</Badge>
              <Badge variant="outline">TypeScript</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Heart className="h-5 w-5 text-red-500" />
              Credits
            </CardTitle>
            <CardDescription>Built with love</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              A portable toolkit for computer repair technicians and power users.
              Designed for efficiency and ease of use.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-2">
                <Github className="h-4 w-4" />
                GitHub
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Features Card - Full Width */}
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="p-4">
              <div className="text-3xl font-bold text-primary">100%</div>
              <div className="text-sm text-muted-foreground">Portable</div>
            </div>
            <div className="p-4">
              <div className="text-3xl font-bold text-primary">Fast</div>
              <div className="text-sm text-muted-foreground">Rust Powered</div>
            </div>
            <div className="p-4">
              <div className="text-3xl font-bold text-primary">Modern</div>
              <div className="text-sm text-muted-foreground">UI Design</div>
            </div>
            <div className="p-4">
              <div className="text-3xl font-bold text-primary">Free</div>
              <div className="text-sm text-muted-foreground">Open Source</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
