'use client';

/*============================================================================
  canvas-actions — 画板右上角功能区

  提供房间搜索与房间总览，共用一个轻量浮层；后续可按实体类型扩展搜索结果。
============================================================================*/

import { useEffect, useRef, useState } from 'react';

import { RoomIcon, SearchIcon } from '@/components/ui/icons';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils/cn';
import type { Room } from '@/lib/types/room-canvas';

import { CanvasOverlay } from './canvas-overlay';
import styles from './canvas-actions.module.css';

type ActivePanel = 'search' | 'rooms' | null;

interface CanvasActionsProps {
    rooms: Room[];
    selectedId: string | null;
    gridSize: number;
    onFocusRoom: (id: string) => void;
}

interface RoomEntryProps {
    room: Room;
    isSelected: boolean;
    gridSize: number;
    onSelect: (id: string) => void;
}

function formatGridValue(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function RoomEntry({ room, isSelected, gridSize, onSelect }: RoomEntryProps) {
    const width = formatGridValue(room.width / gridSize);
    const height = formatGridValue(room.height / gridSize);

    return (
        <button
            className={cn(styles.roomEntry, isSelected && styles.roomEntrySelected)}
            type="button"
            aria-label={`定位到${room.name}`}
            aria-current={isSelected ? 'true' : undefined}
            data-room-entry
            onClick={() => onSelect(room.id)}
        >
            <span className={styles.roomGlyph} aria-hidden="true">
                <RoomIcon />
            </span>
            <span className={styles.roomText}>
                <span className={styles.roomName}>{room.name}</span>
                <span className={styles.roomMeta}>
                    {width} × {height} 格
                </span>
            </span>
        </button>
    );
}

export function CanvasActions({ rooms, selectedId, gridSize, onFocusRoom }: CanvasActionsProps) {
    const [activePanel, setActivePanel] = useState<ActivePanel>(null);
    const [query, setQuery] = useState('');
    const rootRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const searchButtonRef = useRef<HTMLButtonElement>(null);
    const roomsButtonRef = useRef<HTMLButtonElement>(null);

    const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
    const searchResults = normalizedQuery
        ? rooms.filter((room) => room.name.toLocaleLowerCase('zh-CN').includes(normalizedQuery))
        : rooms;

    useEffect(() => {
        if (!activePanel) return;

        const handleDocumentPointerDown = (event: PointerEvent) => {
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

    const handleTogglePanel = (panel: Exclude<ActivePanel, null>) => {
        setActivePanel((currentPanel) => (currentPanel === panel ? null : panel));
    };

    const handleFocusRoom = (id: string) => {
        const returnFocus = activePanel === 'search' ? searchButtonRef.current : roomsButtonRef.current;
        onFocusRoom(id);
        setActivePanel(null);
        requestAnimationFrame(() => returnFocus?.focus());
    };

    const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            const returnFocus = activePanel === 'search' ? searchButtonRef.current : roomsButtonRef.current;
            setActivePanel(null);
            requestAnimationFrame(() => returnFocus?.focus());
            return;
        }

        if (!['ArrowDown', 'ArrowUp'].includes(event.key)) {
            if (event.key === 'Enter' && event.target === searchInputRef.current) {
                const firstResult = event.currentTarget.querySelector<HTMLButtonElement>('[data-room-entry]');
                if (firstResult) {
                    event.preventDefault();
                    firstResult.click();
                }
            }
            return;
        }

        const entries = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-room-entry]'));
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

    const panelTitle = activePanel === 'search' ? '搜索画板' : '全部房间';
    const panelSummary = activePanel === 'search' ? `${searchResults.length} 个结果` : `${rooms.length} 个房间`;
    const visibleRooms = activePanel === 'search' ? searchResults : rooms;

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
                                placeholder="输入房间名称"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                            />
                        </>
                    )}

                    <div className={styles.resultArea}>
                        {visibleRooms.length > 0 ? (
                            <div className={styles.roomList}>
                                {visibleRooms.map((room) => (
                                    <RoomEntry
                                        key={room.id}
                                        room={room}
                                        isSelected={room.id === selectedId}
                                        gridSize={gridSize}
                                        onSelect={handleFocusRoom}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className={styles.emptyState}>
                                <RoomIcon aria-hidden="true" />
                                <p>{rooms.length === 0 ? '画板中还没有房间' : '未找到相关内容'}</p>
                                <span>{rooms.length === 0 ? '使用顶部房间工具创建一个房间' : '试试其他房间名称'}</span>
                            </div>
                        )}
                    </div>
                </section>
            )}
        </CanvasOverlay>
    );
}
