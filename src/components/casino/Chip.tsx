import { cn } from "@/lib/utils";
import React from "react";

interface ChipProps {
  value?: number;
  color?: 'red' | 'blue' | 'green' | 'black' | 'white' | 'gold';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  animated?: boolean;
  style?: React.CSSProperties;
}

const colorClasses = {
  red: 'bg-chip-red border-red-400',
  blue: 'bg-chip-blue border-blue-400',
  green: 'bg-chip-green border-green-400',
  black: 'bg-chip-black border-gray-600',
  white: 'bg-chip-white border-gray-300 text-gray-900',
  gold: 'bg-gold border-gold-light',
};

const sizeClasses = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-12 h-12 text-sm',
  lg: 'w-16 h-16 text-base',
};

export function Chip({ 
  value, 
  color = 'gold', 
  size = 'md', 
  className,
  animated = false,
  style 
}: ChipProps) {
  return (
    <div 
      className={cn(
        "chip",
        colorClasses[color],
        sizeClasses[size],
        "border-2",
        animated && "animate-chip-bounce",
        className
      )}
      style={style}
    >
      {value !== undefined && (
        <span className="font-bold drop-shadow-md">
          {value >= 1000 ? `${(value / 1000).toFixed(0)}K` : value}
        </span>
      )}
    </div>
  );
}

interface ChipStackProps {
  chips: number;
  chipUnitValue: number;
  showValue?: boolean;
  className?: string;
}

export function ChipStack({ chips, chipUnitValue, showValue = true, className }: ChipStackProps) {
  const rupeeValue = (chips * chipUnitValue).toFixed(2);
  
  // Determine stack visualization based on chip count
  const getStackColor = (): 'white' | 'red' | 'blue' | 'green' | 'gold' => {
    if (chips < 100) return 'white';
    if (chips < 500) return 'red';
    if (chips < 1000) return 'blue';
    if (chips < 5000) return 'green';
    return 'gold';
  };

  const stackColor = getStackColor();
  const stackCount = chips === 0 ? 0 : Math.min(Math.ceil(chips / 200), 4);

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div className="relative h-10 w-10 flex items-center justify-center">
        {chips === 0 ? (
          <div className="w-8 h-8 rounded-full border-2 border-dashed border-muted-foreground/30" />
        ) : (
          Array.from({ length: stackCount }).map((_, j) => (
            <Chip 
              key={j}
              color={stackColor}
              size="sm"
              className="absolute"
              style={{ 
                bottom: `${j * 3}px`,
                zIndex: j 
              }}
            />
          ))
        )}
      </div>
      {showValue && (
        <div className="text-center">
          <div className="text-sm font-bold text-foreground">{chips.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">₹{rupeeValue}</div>
        </div>
      )}
    </div>
  );
}
