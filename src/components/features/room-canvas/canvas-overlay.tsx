import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef } from 'react';

interface CanvasOverlayProps extends ComponentPropsWithoutRef<'div'> {
    blockWheel?: boolean;
}

export const CanvasOverlay = forwardRef<HTMLDivElement, CanvasOverlayProps>(function CanvasOverlay(
    { blockWheel = false, onContextMenu, onPointerDown, onWheel, ...props },
    ref
) {
    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        event.stopPropagation();
        onPointerDown?.(event);
    };

    const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        onContextMenu?.(event);
    };

    const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
        if (blockWheel) event.stopPropagation();
        onWheel?.(event);
    };

    return (
        <div
            ref={ref}
            {...props}
            onContextMenu={handleContextMenu}
            onPointerDown={handlePointerDown}
            onWheel={onWheel || blockWheel ? handleWheel : undefined}
        />
    );
});

CanvasOverlay.displayName = 'CanvasOverlay';
