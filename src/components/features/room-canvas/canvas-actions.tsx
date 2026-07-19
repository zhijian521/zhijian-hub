'use client';

import { useEffect, useRef, useState } from 'react';

import { DetailsIcon, ItemIcon, RoomIcon, SearchIcon } from '@/components/ui/icons';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils/cn';
import type { CanvasSelection, Furniture, Item, ItemLocation, Room, StorageDevice } from '@/lib/types/room-canvas';

import { CanvasDetails, EntityEntry, formatGridValue, isSelected } from './canvas-details';
import { CanvasOverlay } from './canvas-overlay';
import styles from './canvas-actions.module.css';

type ActivePanel = 'search' | 'rooms' | 'details' | null;

interface EntitySearchResult {
    type: 'entity';
    entity: CanvasSelection;
    name: string;
    description: string;
}

interface ItemSearchResult {
    type: 'item';
    itemId: string;
    name: string;
    description: string;
}

type SearchResult = EntitySearchResult | ItemSearchResult;

interface CanvasActionsProps {
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
    onFocusItem: (itemId: string) => void;
}

export function CanvasActions({
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
    onFocusItem,
}: CanvasActionsProps) {
    const [activePanel, setActivePanel] = useState<ActivePanel>(null);
    const [query, setQuery] = useState('');
    const rootRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const searchButtonRef = useRef<HTMLButtonElement>(null);
    const roomsButtonRef = useRef<HTMLButtonElement>(null);
    const detailsButtonRef = useRef<HTMLButtonElement>(null);

    const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
    const roomById = new Map(rooms.map((room) => [room.id, room]));
    const furnitureById = new Map(furniture.map((item) => [item.id, item]));
    const storageDeviceById = new Map(storageDevices.map((storageDevice) => [storageDevice.id, storageDevice]));
    const selectedEntityKey = selectedEntity ? `${selectedEntity.kind}:${selectedEntity.id}` : null;
    const entitySearchResults: EntitySearchResult[] = [
        ...rooms.map((room) => ({
            type: 'entity' as const,
            entity: { kind: 'room' as const, id: room.id },
            name: room.name,
            description: `${formatGridValue(room.width / gridSize)} × ${formatGridValue(room.height / gridSize)} 格`,
        })),
        ...furniture.flatMap((item) => {
            const room = roomById.get(item.roomId);
            return room
                ? [
                      {
                          type: 'entity' as const,
                          entity: { kind: 'furniture' as const, id: item.id },
                          name: item.name,
                          description: `${room.name} / 家具`,
                      },
                  ]
                : [];
        }),
        ...storageDevices.flatMap((storageDevice) => {
            if (storageDevice.location.kind === 'room') {
                const room = roomById.get(storageDevice.location.roomId);
                return room
                    ? [
                          {
                              type: 'entity' as const,
                              entity: { kind: 'storage-device' as const, id: storageDevice.id },
                              name: storageDevice.name,
                              description: `${room.name} / 储物设备`,
                          },
                      ]
                    : [];
            }

            const furnitureId = storageDevice.location.furnitureId;
            const parentFurniture = furniture.find((item) => item.id === furnitureId);
            const room = parentFurniture ? roomById.get(parentFurniture.roomId) : null;
            return parentFurniture && room
                ? [
                      {
                          type: 'entity' as const,
                          entity: { kind: 'storage-device' as const, id: storageDevice.id },
                          name: storageDevice.name,
                          description: `${room.name} / ${parentFurniture.name} / 储物设备`,
                      },
                  ]
                : [];
        }),
    ];
    const itemSearchResults: ItemSearchResult[] = items.flatMap((item) => {
        if (item.location.kind === 'room') {
            const room = roomById.get(item.location.roomId);
            return room
                ? [{ type: 'item' as const, itemId: item.id, name: item.name, description: `${room.name} / 物品` }]
                : [];
        }
        if (item.location.kind === 'furniture') {
            const parentFurniture = furnitureById.get(item.location.furnitureId);
            const room = parentFurniture ? roomById.get(parentFurniture.roomId) : null;
            return parentFurniture && room
                ? [
                      {
                          type: 'item' as const,
                          itemId: item.id,
                          name: item.name,
                          description: `${room.name} / ${parentFurniture.name} / 物品`,
                      },
                  ]
                : [];
        }

        const storageDevice = storageDeviceById.get(item.location.storageDeviceId);
        if (!storageDevice) return [];
        if (storageDevice.location.kind === 'room') {
            const room = roomById.get(storageDevice.location.roomId);
            return room
                ? [
                      {
                          type: 'item' as const,
                          itemId: item.id,
                          name: item.name,
                          description: `${room.name} / ${storageDevice.name} / 物品`,
                      },
                  ]
                : [];
        }
        const parentFurniture = furnitureById.get(storageDevice.location.furnitureId);
        const room = parentFurniture ? roomById.get(parentFurniture.roomId) : null;
        return parentFurniture && room
            ? [
                  {
                      type: 'item' as const,
                      itemId: item.id,
                      name: item.name,
                      description: `${room.name} / ${parentFurniture.name} / ${storageDevice.name} / 物品`,
                  },
              ]
            : [];
    });
    const searchResults: SearchResult[] = [...entitySearchResults, ...itemSearchResults].filter(
        (result) => !normalizedQuery || result.name.toLocaleLowerCase('zh-CN').includes(normalizedQuery)
    );

    useEffect(() => {
        if (!activePanel) return;

        const handleDocumentPointerDown = (event: PointerEvent) => {
            if (event.target instanceof Element && event.target.closest('[role="dialog"], [role="menu"]')) return;
            if (!rootRef.current?.contains(event.target as Node)) setActivePanel(null);
        };

        document.addEventListener('pointerdown', handleDocumentPointerDown);
        return () => document.removeEventListener('pointerdown', handleDocumentPointerDown);
    }, [activePanel]);

    useEffect(() => {
        if (activePanel !== 'search') return;
        const animationFrame = requestAnimationFrame(() => searchInputRef.current?.focus());
        return () => cancelAnimationFrame(animationFrame);
    }, [activePanel]);

    useEffect(() => {
        if (selectedEntityKey) setActivePanel('details');
        else setActivePanel((currentPanel) => (currentPanel === 'details' ? null : currentPanel));
    }, [selectedEntityKey]);

    const getPanelTrigger = () => {
        if (activePanel === 'search') return searchButtonRef.current;
        if (activePanel === 'rooms') return roomsButtonRef.current;
        return detailsButtonRef.current;
    };

    const handleTogglePanel = (panel: Exclude<ActivePanel, null>) => {
        setActivePanel((currentPanel) => (currentPanel === panel ? null : panel));
    };

    const handleFocusEntity = (entity: CanvasSelection) => {
        onFocusEntity(entity);
        setActivePanel('details');
    };

    const handleFocusItem = (itemId: string) => {
        onFocusItem(itemId);
        setActivePanel('details');
    };

    const handleStartFurnitureDrawing = (roomId: string) => {
        onStartFurnitureDrawing(roomId);
        setActivePanel(null);
    };

    const handleStartStorageDeviceDrawing = (roomId: string) => {
        onStartStorageDeviceDrawing(roomId);
        setActivePanel(null);
    };

    const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            const returnFocus = getPanelTrigger();
            setActivePanel(null);
            requestAnimationFrame(() => returnFocus?.focus());
            return;
        }

        if (!['ArrowDown', 'ArrowUp'].includes(event.key)) {
            if (event.key === 'Enter' && event.target === searchInputRef.current) {
                const firstResult = event.currentTarget.querySelector<HTMLButtonElement>('[data-canvas-entry]');
                if (firstResult) {
                    event.preventDefault();
                    firstResult.click();
                }
            }
            return;
        }

        const entries = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-canvas-entry]'));
        if (entries.length === 0) return;
        event.preventDefault();
        const currentIndex = entries.indexOf(document.activeElement as HTMLButtonElement);
        if (currentIndex === -1) {
            entries[event.key === 'ArrowDown' ? 0 : entries.length - 1].focus();
            return;
        }
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        entries[(currentIndex + direction + entries.length) % entries.length].focus();
    };

    const panelTitle = activePanel === 'search' ? '搜索画板' : activePanel === 'rooms' ? '全部房间' : '当前位置';
    const panelSummary =
        activePanel === 'search'
            ? `${searchResults.length} 个结果`
            : activePanel === 'rooms'
              ? `${rooms.length} 个房间`
              : selectedEntity?.kind === 'room'
                ? '房间详情'
                : selectedEntity?.kind === 'furniture'
                  ? '家具详情'
                  : '储物设备详情';

    return (
        <CanvasOverlay ref={rootRef} className={styles.root} blockWheel>
            <div className={styles.actions} role="toolbar" aria-label="画板功能">
                <button
                    ref={searchButtonRef}
                    className={cn(styles.actionButton, activePanel === 'search' && styles.actionButtonActive)}
                    type="button"
                    aria-label="搜索"
                    aria-controls="canvas-actions-panel"
                    aria-expanded={activePanel === 'search'}
                    onClick={() => handleTogglePanel('search')}
                >
                    <SearchIcon aria-hidden="true" />
                </button>
                <button
                    ref={roomsButtonRef}
                    className={cn(styles.actionButton, activePanel === 'rooms' && styles.actionButtonActive)}
                    type="button"
                    aria-label={`查看全部房间，共 ${rooms.length} 个`}
                    aria-controls="canvas-actions-panel"
                    aria-expanded={activePanel === 'rooms'}
                    onClick={() => handleTogglePanel('rooms')}
                >
                    <RoomIcon aria-hidden="true" />
                </button>
                <button
                    ref={detailsButtonRef}
                    className={cn(styles.actionButton, activePanel === 'details' && styles.actionButtonActive)}
                    type="button"
                    aria-label="查看当前位置详情"
                    aria-controls="canvas-actions-panel"
                    aria-expanded={activePanel === 'details'}
                    disabled={!selectedEntity}
                    onClick={() => handleTogglePanel('details')}
                >
                    <DetailsIcon aria-hidden="true" />
                </button>
            </div>

            {activePanel && (
                <section
                    className={styles.panel}
                    id="canvas-actions-panel"
                    aria-label={panelTitle}
                    onKeyDown={handlePanelKeyDown}
                >
                    <header className={styles.panelHeader}>
                        <h2 className={styles.panelTitle}>{panelTitle}</h2>
                        <span className={styles.panelSummary} aria-live="polite">
                            {panelSummary}
                        </span>
                    </header>

                    {activePanel === 'search' && (
                        <>
                            <label className={styles.srOnly} htmlFor="canvas-search-input">
                                搜索画板内容
                            </label>
                            <Input
                                ref={searchInputRef}
                                id="canvas-search-input"
                                containerClassName={styles.searchInput}
                                type="search"
                                autoComplete="off"
                                leadingIcon={<SearchIcon />}
                                placeholder="输入房间、家具、储物设备或物品名称"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                            />
                        </>
                    )}

                    {activePanel === 'details' ? (
                        <CanvasDetails
                            rooms={rooms}
                            furniture={furniture}
                            storageDevices={storageDevices}
                            items={items}
                            selectedEntity={selectedEntity}
                            highlightedEntity={highlightedEntity}
                            highlightedItemId={highlightedItemId}
                            gridSize={gridSize}
                            onFocusEntity={handleFocusEntity}
                            onStartFurnitureDrawing={handleStartFurnitureDrawing}
                            onStartStorageDeviceDrawing={handleStartStorageDeviceDrawing}
                            onCreateFurnitureStorageDevice={onCreateFurnitureStorageDevice}
                            onStartRename={onStartRename}
                            onRequestDelete={onRequestDelete}
                            onMoveFurnitureToRoom={onMoveFurnitureToRoom}
                            onMoveStorageDevice={onMoveStorageDevice}
                            onStartCreateItem={onStartCreateItem}
                            onStartEditItem={onStartEditItem}
                            onDeleteItem={onDeleteItem}
                        />
                    ) : (
                        <div className={styles.resultArea}>
                            {(activePanel === 'search' ? searchResults.length : rooms.length) > 0 ? (
                                <div className={styles.roomList}>
                                    {activePanel === 'search'
                                        ? searchResults.map((result) =>
                                              result.type === 'entity' ? (
                                                  <EntityEntry
                                                      key={`${result.entity.kind}-${result.entity.id}`}
                                                      entity={result.entity}
                                                      name={result.name}
                                                      description={result.description}
                                                      isSelected={isSelected(selectedEntity, result.entity)}
                                                      isHighlighted={isSelected(highlightedEntity, result.entity)}
                                                      onSelect={handleFocusEntity}
                                                  />
                                              ) : (
                                                  <button
                                                      key={result.itemId}
                                                      className={cn(
                                                          styles.roomEntry,
                                                          highlightedItemId === result.itemId &&
                                                              styles.roomEntryHighlighted
                                                      )}
                                                      type="button"
                                                      aria-label={`定位到${result.name}（物品）`}
                                                      data-canvas-entry
                                                      data-highlighted={
                                                          highlightedItemId === result.itemId ? 'true' : undefined
                                                      }
                                                      onClick={() => handleFocusItem(result.itemId)}
                                                  >
                                                      <span className={styles.roomGlyph} aria-hidden="true">
                                                          <ItemIcon />
                                                      </span>
                                                      <span className={styles.roomText}>
                                                          <span className={styles.roomName}>{result.name}</span>
                                                          <span className={styles.roomMeta}>{result.description}</span>
                                                      </span>
                                                  </button>
                                              )
                                          )
                                        : rooms.map((room) => {
                                              const entity = { kind: 'room' as const, id: room.id };
                                              const furnitureCount = furniture.filter(
                                                  (item) => item.roomId === room.id
                                              ).length;
                                              const storageCount = storageDevices.filter(
                                                  (item) =>
                                                      item.location.kind === 'room' && item.location.roomId === room.id
                                              ).length;
                                              return (
                                                  <EntityEntry
                                                      key={room.id}
                                                      entity={entity}
                                                      name={room.name}
                                                      description={`${formatGridValue(room.width / gridSize)} × ${formatGridValue(room.height / gridSize)} 格 · ${furnitureCount} 件家具 · ${storageCount} 个储物设备`}
                                                      isSelected={isSelected(selectedEntity, entity)}
                                                      isHighlighted={isSelected(highlightedEntity, entity)}
                                                      onSelect={handleFocusEntity}
                                                  />
                                              );
                                          })}
                                </div>
                            ) : (
                                <div className={styles.emptyState}>
                                    <RoomIcon aria-hidden="true" />
                                    <p>{rooms.length === 0 ? '画板中还没有房间' : '未找到相关内容'}</p>
                                    <span>{rooms.length === 0 ? '使用顶部房间工具创建一个房间' : '试试其他名称'}</span>
                                </div>
                            )}
                        </div>
                    )}
                </section>
            )}
        </CanvasOverlay>
    );
}
