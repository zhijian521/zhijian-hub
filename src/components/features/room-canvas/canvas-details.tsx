import { Button } from '@/components/ui/button';
import { FurnitureIcon, RoomIcon, StorageIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils/cn';
import type {
    CanvasSelection,
    Furniture,
    Item,
    ItemLocation,
    Room,
    RoomStorageDevice,
    StorageDevice,
} from '@/lib/types/room-canvas';

import { ItemSection } from './canvas-items';
import styles from './canvas-actions.module.css';

interface EntityEntryProps {
    entity: CanvasSelection;
    name: string;
    description: string;
    isSelected: boolean;
    isHighlighted?: boolean;
    onSelect: (entity: CanvasSelection) => void;
}

interface CanvasDetailsProps {
    rooms: Room[];
    furniture: Furniture[];
    storageDevices: StorageDevice[];
    items: Item[];
    selectedEntity: CanvasSelection | null;
    highlightedEntity: CanvasSelection | null;
    highlightedItemId: string | null;
    gridSize: number;
    onFocusEntity: (entity: CanvasSelection) => void;
    onStartFurnitureDrawing: (roomId: string) => void;
    onStartStorageDeviceDrawing: (roomId: string) => void;
    onCreateFurnitureStorageDevice: (furnitureId: string) => void;
    onStartRename: (entity: CanvasSelection) => void;
    onRequestDelete: (entity: CanvasSelection) => void;
    onMoveFurnitureToRoom: (furnitureId: string, roomId: string) => void;
    onMoveStorageDevice: (storageDeviceId: string, locationValue: string) => void;
    onStartCreateItem: (location: ItemLocation) => void;
    onStartEditItem: (itemId: string) => void;
    onDeleteItem: (itemId: string) => void;
}

export function formatGridValue(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function isSelected(selectedEntity: CanvasSelection | null, entity: CanvasSelection): boolean {
    return selectedEntity?.kind === entity.kind && selectedEntity.id === entity.id;
}

function getEntityIcon(kind: CanvasSelection['kind']) {
    if (kind === 'room') return <RoomIcon />;
    if (kind === 'furniture') return <FurnitureIcon />;
    return <StorageIcon />;
}

function isRoomStorageDevice(storageDevice: StorageDevice): storageDevice is RoomStorageDevice {
    return storageDevice.location.kind === 'room';
}

export function EntityEntry({
    entity,
    name,
    description,
    isSelected: entrySelected,
    isHighlighted,
    onSelect,
}: EntityEntryProps) {
    const entityLabel = entity.kind === 'room' ? '房间' : entity.kind === 'furniture' ? '家具' : '储物设备';
    const ariaLabel = entity.kind === 'room' ? `定位到${name}` : `定位到${name}（${entityLabel}）`;

    return (
        <button
            className={cn(
                styles.roomEntry,
                entrySelected && styles.roomEntrySelected,
                isHighlighted && styles.roomEntryHighlighted
            )}
            type="button"
            aria-label={ariaLabel}
            aria-current={entrySelected ? 'true' : undefined}
            data-canvas-entry
            data-highlighted={isHighlighted ? 'true' : undefined}
            onClick={() => onSelect(entity)}
        >
            <span className={styles.roomGlyph} aria-hidden="true">
                {getEntityIcon(entity.kind)}
            </span>
            <span className={styles.roomText}>
                <span className={styles.roomName}>{name}</span>
                <span className={styles.roomMeta}>{description}</span>
            </span>
        </button>
    );
}

export function CanvasDetails({
    rooms,
    furniture,
    storageDevices,
    items,
    selectedEntity,
    highlightedEntity,
    highlightedItemId,
    gridSize,
    onFocusEntity,
    onStartFurnitureDrawing,
    onStartStorageDeviceDrawing,
    onCreateFurnitureStorageDevice,
    onStartRename,
    onRequestDelete,
    onMoveFurnitureToRoom,
    onMoveStorageDevice,
    onStartCreateItem,
    onStartEditItem,
    onDeleteItem,
}: CanvasDetailsProps) {
    const roomById = new Map(rooms.map((room) => [room.id, room]));
    const furnitureById = new Map(furniture.map((item) => [item.id, item]));
    const selectedRoom = selectedEntity?.kind === 'room' ? roomById.get(selectedEntity.id) : null;
    const selectedFurniture = selectedEntity?.kind === 'furniture' ? furnitureById.get(selectedEntity.id) : null;
    const selectedStorageDevice =
        selectedEntity?.kind === 'storage-device' ? storageDevices.find((item) => item.id === selectedEntity.id) : null;
    const selectedFurnitureRoom = selectedFurniture ? roomById.get(selectedFurniture.roomId) : null;
    const selectedStorageFurniture =
        selectedStorageDevice?.location.kind === 'furniture'
            ? furnitureById.get(selectedStorageDevice.location.furnitureId)
            : null;
    const selectedStorageRoom = selectedStorageDevice
        ? selectedStorageDevice.location.kind === 'room'
            ? roomById.get(selectedStorageDevice.location.roomId)
            : roomById.get(selectedStorageFurniture?.roomId ?? '')
        : null;
    const selectedRoomFurniture = selectedRoom ? furniture.filter((item) => item.roomId === selectedRoom.id) : [];
    const selectedRoomStorageDevices = selectedRoom
        ? storageDevices.filter(
              (item): item is RoomStorageDevice => isRoomStorageDevice(item) && item.location.roomId === selectedRoom.id
          )
        : [];
    const selectedFurnitureStorageDevices = selectedFurniture
        ? storageDevices.filter(
              (item) => item.location.kind === 'furniture' && item.location.furnitureId === selectedFurniture.id
          )
        : [];
    const selectedStorageRect =
        selectedStorageDevice && isRoomStorageDevice(selectedStorageDevice) ? selectedStorageDevice.rect : null;
    const selectedRoomItems = selectedRoom
        ? items.filter((item) => item.location.kind === 'room' && item.location.roomId === selectedRoom.id)
        : [];
    const selectedFurnitureItems = selectedFurniture
        ? items.filter(
              (item) => item.location.kind === 'furniture' && item.location.furnitureId === selectedFurniture.id
          )
        : [];
    const selectedStorageItems = selectedStorageDevice
        ? items.filter(
              (item) =>
                  item.location.kind === 'storage-device' && item.location.storageDeviceId === selectedStorageDevice.id
          )
        : [];

    return (
        <div className={styles.detailArea}>
            {selectedRoom && (
                <>
                    <div className={styles.detailHeading}>
                        <span className={styles.detailIcon} aria-hidden="true">
                            <RoomIcon />
                        </span>
                        <div>
                            <strong>{selectedRoom.name}</strong>
                            <span>
                                {selectedRoomFurniture.length} 件家具 · {selectedRoomStorageDevices.length} 个储物设备 ·{' '}
                                {selectedRoomItems.length} 项物品
                            </span>
                        </div>
                    </div>
                    <div className={styles.detailActions}>
                        <Button
                            type="button"
                            variant="primary"
                            size="small"
                            onClick={() => onStartFurnitureDrawing(selectedRoom.id)}
                        >
                            添加家具
                        </Button>
                        <Button type="button" size="small" onClick={() => onStartStorageDeviceDrawing(selectedRoom.id)}>
                            添加储物设备
                        </Button>
                        <Button
                            type="button"
                            size="small"
                            onClick={() => onStartCreateItem({ kind: 'room', roomId: selectedRoom.id })}
                        >
                            添加物品
                        </Button>
                        <Button
                            type="button"
                            size="small"
                            onClick={() => onStartRename({ kind: 'room', id: selectedRoom.id })}
                        >
                            重命名
                        </Button>
                        <Button
                            type="button"
                            variant="danger"
                            size="small"
                            onClick={() => onRequestDelete({ kind: 'room', id: selectedRoom.id })}
                        >
                            删除
                        </Button>
                    </div>
                    <div className={styles.detailSection}>
                        <h3>房间内家具</h3>
                        {selectedRoomFurniture.length > 0 ? (
                            <div className={styles.roomList}>
                                {selectedRoomFurniture.map((item) => (
                                    <EntityEntry
                                        key={item.id}
                                        entity={{ kind: 'furniture', id: item.id }}
                                        name={item.name}
                                        description={`${formatGridValue(item.width / gridSize)} × ${formatGridValue(item.height / gridSize)} 格`}
                                        isSelected={isSelected(selectedEntity, { kind: 'furniture', id: item.id })}
                                        isHighlighted={isSelected(highlightedEntity, {
                                            kind: 'furniture',
                                            id: item.id,
                                        })}
                                        onSelect={onFocusEntity}
                                    />
                                ))}
                            </div>
                        ) : (
                            <p className={styles.detailEmpty}>还没有家具，点击“添加家具”后在房间内拖拽创建。</p>
                        )}
                    </div>
                    <div className={styles.detailSection}>
                        <h3>房间内储物设备</h3>
                        {selectedRoomStorageDevices.length > 0 ? (
                            <div className={styles.roomList}>
                                {selectedRoomStorageDevices.map((item) => (
                                    <EntityEntry
                                        key={item.id}
                                        entity={{ kind: 'storage-device', id: item.id }}
                                        name={item.name}
                                        description={`${formatGridValue(item.rect.width / gridSize)} × ${formatGridValue(item.rect.height / gridSize)} 格`}
                                        isSelected={isSelected(selectedEntity, {
                                            kind: 'storage-device',
                                            id: item.id,
                                        })}
                                        isHighlighted={isSelected(highlightedEntity, {
                                            kind: 'storage-device',
                                            id: item.id,
                                        })}
                                        onSelect={onFocusEntity}
                                    />
                                ))}
                            </div>
                        ) : (
                            <p className={styles.detailEmpty}>还没有房间级储物设备，添加后可在房间内拖拽创建。</p>
                        )}
                    </div>
                    <div className={styles.detailSection}>
                        <h3>直接放在房间里的物品</h3>
                        <ItemSection
                            items={selectedRoomItems}
                            highlightedItemId={highlightedItemId}
                            onEdit={onStartEditItem}
                            onDelete={onDeleteItem}
                        />
                    </div>
                </>
            )}

            {selectedFurniture && selectedFurnitureRoom && (
                <>
                    <div className={styles.detailPath}>
                        {selectedFurnitureRoom.name} / {selectedFurniture.name}
                    </div>
                    <div className={styles.detailHeading}>
                        <span className={styles.detailIcon} aria-hidden="true">
                            <FurnitureIcon />
                        </span>
                        <div>
                            <strong>{selectedFurniture.name}</strong>
                            <span>
                                {selectedFurnitureStorageDevices.length} 个储物设备 · {selectedFurnitureItems.length}{' '}
                                项物品
                            </span>
                        </div>
                    </div>
                    <label className={styles.roomSelectLabel}>
                        所属房间
                        <select
                            className={styles.roomSelect}
                            value={selectedFurniture.roomId}
                            onChange={(event) => onMoveFurnitureToRoom(selectedFurniture.id, event.target.value)}
                        >
                            {rooms.map((room) => (
                                <option key={room.id} value={room.id}>
                                    {room.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <div className={styles.detailActions}>
                        <Button
                            type="button"
                            variant="primary"
                            size="small"
                            onClick={() => onCreateFurnitureStorageDevice(selectedFurniture.id)}
                        >
                            添加储物设备
                        </Button>
                        <Button
                            type="button"
                            size="small"
                            onClick={() => onStartCreateItem({ kind: 'furniture', furnitureId: selectedFurniture.id })}
                        >
                            添加物品
                        </Button>
                        <Button
                            type="button"
                            size="small"
                            onClick={() => onStartRename({ kind: 'furniture', id: selectedFurniture.id })}
                        >
                            重命名
                        </Button>
                        <Button
                            type="button"
                            variant="danger"
                            size="small"
                            onClick={() => onRequestDelete({ kind: 'furniture', id: selectedFurniture.id })}
                        >
                            删除
                        </Button>
                    </div>
                    <div className={styles.detailSection}>
                        <h3>家具内储物设备</h3>
                        {selectedFurnitureStorageDevices.length > 0 ? (
                            <div className={styles.roomList}>
                                {selectedFurnitureStorageDevices.map((item) => (
                                    <EntityEntry
                                        key={item.id}
                                        entity={{ kind: 'storage-device', id: item.id }}
                                        name={item.name}
                                        description="家具内逻辑储物设备"
                                        isSelected={isSelected(selectedEntity, {
                                            kind: 'storage-device',
                                            id: item.id,
                                        })}
                                        isHighlighted={isSelected(highlightedEntity, {
                                            kind: 'storage-device',
                                            id: item.id,
                                        })}
                                        onSelect={onFocusEntity}
                                    />
                                ))}
                            </div>
                        ) : (
                            <p className={styles.detailEmpty}>还没有储物设备，可直接创建为家具内部的逻辑容器。</p>
                        )}
                    </div>
                    <div className={styles.detailSection}>
                        <h3>直接放在家具里的物品</h3>
                        <ItemSection
                            items={selectedFurnitureItems}
                            highlightedItemId={highlightedItemId}
                            onEdit={onStartEditItem}
                            onDelete={onDeleteItem}
                        />
                    </div>
                </>
            )}

            {selectedStorageDevice && selectedStorageRoom && (
                <>
                    <div className={styles.detailPath}>
                        {selectedStorageRoom.name}
                        {selectedStorageFurniture ? ` / ${selectedStorageFurniture.name}` : ''} /{' '}
                        {selectedStorageDevice.name}
                    </div>
                    <div
                        className={cn(
                            styles.detailHeading,
                            isSelected(highlightedEntity, {
                                kind: 'storage-device',
                                id: selectedStorageDevice.id,
                            }) && styles.detailHeadingHighlighted
                        )}
                        data-highlighted={
                            isSelected(highlightedEntity, {
                                kind: 'storage-device',
                                id: selectedStorageDevice.id,
                            })
                                ? 'true'
                                : undefined
                        }
                    >
                        <span className={styles.detailIcon} aria-hidden="true">
                            <StorageIcon />
                        </span>
                        <div>
                            <strong>{selectedStorageDevice.name}</strong>
                            <span>
                                {selectedStorageRect
                                    ? `${formatGridValue(selectedStorageRect.width / gridSize)} × ${formatGridValue(selectedStorageRect.height / gridSize)} 格`
                                    : '家具内逻辑储物设备'}
                            </span>
                        </div>
                    </div>
                    <label className={styles.roomSelectLabel}>
                        存放位置
                        <select
                            className={styles.roomSelect}
                            value={
                                selectedStorageDevice.location.kind === 'room'
                                    ? `room:${selectedStorageDevice.location.roomId}`
                                    : `furniture:${selectedStorageDevice.location.furnitureId}`
                            }
                            onChange={(event) => onMoveStorageDevice(selectedStorageDevice.id, event.target.value)}
                        >
                            {rooms.map((room) => (
                                <optgroup key={room.id} label={room.name}>
                                    <option value={`room:${room.id}`}>{room.name}（直接放置）</option>
                                    {furniture
                                        .filter((item) => item.roomId === room.id)
                                        .map((item) => (
                                            <option key={item.id} value={`furniture:${item.id}`}>
                                                {item.name}
                                            </option>
                                        ))}
                                </optgroup>
                            ))}
                        </select>
                    </label>
                    <div className={styles.detailActions}>
                        <Button
                            type="button"
                            variant="primary"
                            size="small"
                            onClick={() =>
                                onStartCreateItem({
                                    kind: 'storage-device',
                                    storageDeviceId: selectedStorageDevice.id,
                                })
                            }
                        >
                            添加物品
                        </Button>
                        <Button
                            type="button"
                            size="small"
                            onClick={() => onStartRename({ kind: 'storage-device', id: selectedStorageDevice.id })}
                        >
                            重命名
                        </Button>
                        <Button
                            type="button"
                            variant="danger"
                            size="small"
                            onClick={() => onRequestDelete({ kind: 'storage-device', id: selectedStorageDevice.id })}
                        >
                            删除
                        </Button>
                    </div>
                    <div className={styles.detailSection}>
                        <h3>储物设备内物品</h3>
                        <ItemSection
                            items={selectedStorageItems}
                            highlightedItemId={highlightedItemId}
                            onEdit={onStartEditItem}
                            onDelete={onDeleteItem}
                        />
                    </div>
                </>
            )}
        </div>
    );
}
