import { FurnitureIcon, StorageIcon } from '@/components/ui/icons';
import { Show } from '@/components/ui/show';
import { cn } from '@/lib/utils/cn';
import type { CanvasSelection, Furniture, ResizeHandle, Room, RoomStorageDevice } from '@/lib/types/room-canvas';

import styles from './room-canvas.module.css';

const HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

interface ResizeHandlesProps {
    entity: CanvasSelection;
    onPointerDown: (event: React.PointerEvent<HTMLSpanElement>, entity: CanvasSelection, handle: ResizeHandle) => void;
}

function ResizeHandles({ entity, onPointerDown }: ResizeHandlesProps) {
    return HANDLES.map((handle) => (
        <span
            key={handle}
            className={cn(styles.handle, styles[`handle${handle.toUpperCase()}`])}
            aria-hidden="true"
            onPointerDown={(event) => onPointerDown(event, entity, handle)}
        />
    ));
}

interface RoomNodeProps {
    room: Room;
    isSelected: boolean;
    isHighlighted: boolean;
    isDrawingTarget: boolean;
    instructionsId: string;
    onSelect: (entity: CanvasSelection) => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>, room: Room) => void;
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>, room: Room) => void;
    onContextMenu: (event: React.MouseEvent, room: Room) => void;
    onHandlePointerDown: ResizeHandlesProps['onPointerDown'];
}

export function RoomNode({
    room,
    isSelected,
    isHighlighted,
    isDrawingTarget,
    instructionsId,
    onSelect,
    onKeyDown,
    onPointerDown,
    onContextMenu,
    onHandlePointerDown,
}: RoomNodeProps) {
    const entity = { kind: 'room' as const, id: room.id };

    return (
        <button
            className={cn(
                styles.room,
                isSelected && styles.roomSelected,
                isHighlighted && styles.roomHighlighted,
                isDrawingTarget && styles.roomDrawingTarget
            )}
            type="button"
            style={{ left: room.x, top: room.y, width: room.width, height: room.height }}
            aria-describedby={instructionsId}
            aria-label={room.name}
            aria-pressed={isSelected}
            data-highlighted={isHighlighted ? 'true' : undefined}
            onFocus={() => onSelect(entity)}
            onKeyDown={(event) => onKeyDown(event, room)}
            onPointerDown={(event) => onPointerDown(event, room)}
            onContextMenu={(event) => onContextMenu(event, room)}
        >
            <span className={styles.roomLabel}>{room.name}</span>
            <Show when={isSelected && !isDrawingTarget}>
                <ResizeHandles entity={entity} onPointerDown={onHandlePointerDown} />
            </Show>
        </button>
    );
}

interface FurnitureNodeProps {
    furniture: Furniture;
    room: Room;
    isSelected: boolean;
    isHighlighted: boolean;
    isDrawingMode: boolean;
    instructionsId: string;
    onSelect: (entity: CanvasSelection) => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>, furniture: Furniture) => void;
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>, furniture: Furniture) => void;
    onContextMenu: (event: React.MouseEvent, furniture: Furniture) => void;
    onHandlePointerDown: ResizeHandlesProps['onPointerDown'];
}

export function FurnitureNode({
    furniture,
    room,
    isSelected,
    isHighlighted,
    isDrawingMode,
    instructionsId,
    onSelect,
    onKeyDown,
    onPointerDown,
    onContextMenu,
    onHandlePointerDown,
}: FurnitureNodeProps) {
    const entity = { kind: 'furniture' as const, id: furniture.id };

    return (
        <button
            className={cn(
                styles.furniture,
                isSelected && styles.furnitureSelected,
                isHighlighted && styles.furnitureHighlighted,
                isDrawingMode && styles.furnitureDrawingMode
            )}
            type="button"
            style={{
                left: room.x + furniture.x,
                top: room.y + furniture.y,
                width: furniture.width,
                height: furniture.height,
            }}
            aria-describedby={instructionsId}
            aria-label={furniture.name}
            aria-pressed={isSelected}
            data-highlighted={isHighlighted ? 'true' : undefined}
            onFocus={() => onSelect(entity)}
            onKeyDown={(event) => onKeyDown(event, furniture)}
            onPointerDown={(event) => onPointerDown(event, furniture)}
            onContextMenu={(event) => onContextMenu(event, furniture)}
        >
            <span className={styles.furnitureLabel}>
                <FurnitureIcon aria-hidden="true" />
                <span>{furniture.name}</span>
            </span>
            <Show when={isSelected}>
                <ResizeHandles entity={entity} onPointerDown={onHandlePointerDown} />
            </Show>
        </button>
    );
}

interface StorageDeviceNodeProps {
    storageDevice: RoomStorageDevice;
    room: Room;
    isSelected: boolean;
    isHighlighted: boolean;
    isDrawingMode: boolean;
    instructionsId: string;
    onSelect: (entity: CanvasSelection) => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>, storageDevice: RoomStorageDevice) => void;
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>, storageDevice: RoomStorageDevice) => void;
    onContextMenu: (event: React.MouseEvent, storageDevice: RoomStorageDevice) => void;
    onHandlePointerDown: ResizeHandlesProps['onPointerDown'];
}

export function StorageDeviceNode({
    storageDevice,
    room,
    isSelected,
    isHighlighted,
    isDrawingMode,
    instructionsId,
    onSelect,
    onKeyDown,
    onPointerDown,
    onContextMenu,
    onHandlePointerDown,
}: StorageDeviceNodeProps) {
    const entity = { kind: 'storage-device' as const, id: storageDevice.id };

    return (
        <button
            className={cn(
                styles.storageDevice,
                isSelected && styles.storageDeviceSelected,
                isHighlighted && styles.storageDeviceHighlighted,
                isDrawingMode && styles.storageDeviceDrawingMode
            )}
            type="button"
            style={{
                left: room.x + storageDevice.rect.x,
                top: room.y + storageDevice.rect.y,
                width: storageDevice.rect.width,
                height: storageDevice.rect.height,
            }}
            aria-describedby={instructionsId}
            aria-label={storageDevice.name}
            aria-pressed={isSelected}
            data-highlighted={isHighlighted ? 'true' : undefined}
            onFocus={() => onSelect(entity)}
            onKeyDown={(event) => onKeyDown(event, storageDevice)}
            onPointerDown={(event) => onPointerDown(event, storageDevice)}
            onContextMenu={(event) => onContextMenu(event, storageDevice)}
        >
            <span className={styles.storageDeviceLabel}>
                <StorageIcon aria-hidden="true" />
                <span>{storageDevice.name}</span>
            </span>
            <Show when={isSelected}>
                <ResizeHandles entity={entity} onPointerDown={onHandlePointerDown} />
            </Show>
        </button>
    );
}
