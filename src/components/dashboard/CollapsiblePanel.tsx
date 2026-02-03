'use client';

import { useState, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface CollapsiblePanelProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  badge?: ReactNode;
  className?: string;
}

export function CollapsiblePanel({
  title,
  icon,
  children,
  defaultOpen = true,
  badge,
  className = '',
}: CollapsiblePanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <CardTitle className="text-lg">{title}</CardTitle>
            {badge}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(!isOpen)}
            className="h-8 w-8 p-0 md:hidden"
          >
            {isOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className={`${isOpen ? 'block' : 'hidden md:block'}`}>
        {children}
      </CardContent>
    </Card>
  );
}
