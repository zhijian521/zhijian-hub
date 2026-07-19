'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

import {
    createEmptyCanvasDocument,
    readRoomCanvasDocument,
    saveRoomCanvasDocument,
} from '@/lib/utils/room-canvas-storage';
import type { CanvasContent, CanvasDocumentV2, Room } from '@/lib/types/room-canvas';

interface CanvasHistory {
    past: CanvasContent[];
    future: CanvasContent[];
}

interface UseCanvasDocumentReturn {
    document: CanvasDocumentV2;
    documentRef: RefObject<CanvasDocumentV2>;
    canUndo: boolean;
    canRedo: boolean;
    replaceContent: (content: CanvasContent) => void;
    replaceRooms: (rooms: Room[]) => void;
    commitRooms: (rooms: Room[]) => boolean;
    commitContent: (content: CanvasContent) => boolean;
    recordContentHistory: (previousContent: CanvasContent) => boolean;
    reserveRoomSequence: () => number;
    reserveFurnitureSequence: () => number;
    reserveStorageDeviceSequence: () => number;
    reserveItemSequence: () => number;
    undo: () => CanvasContent | null;
    redo: () => CanvasContent | null;
}

const HISTORY_LIMIT = 50;
const STORAGE_SAVE_DELAY = 300;

function getCanvasContent(document: CanvasDocumentV2): CanvasContent {
    return {
        rooms: document.rooms,
        furniture: document.furniture,
        storageDevices: document.storageDevices,
        items: document.items,
    };
}

function areCanvasContentsEqual(left: CanvasContent, right: CanvasContent): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

export function useCanvasDocument(): UseCanvasDocumentReturn {
    const [document, setDocument] = useState<CanvasDocumentV2>(createEmptyCanvasDocument);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);
    const [isStorageReady, setIsStorageReady] = useState(false);

    const documentRef = useRef(document);
    const historyRef = useRef<CanvasHistory>({ past: [], future: [] });
    const isDirtyRef = useRef(false);
    const shouldSaveOnPageHideRef = useRef(false);

    const replaceDocument = useCallback((nextDocument: CanvasDocumentV2, isMutation: boolean) => {
        documentRef.current = nextDocument;
        if (isMutation) {
            isDirtyRef.current = true;
            shouldSaveOnPageHideRef.current = true;
        }
        setDocument(nextDocument);
    }, []);

    useEffect(() => {
        const result = readRoomCanvasDocument();
        if (result.status === 'ready') {
            documentRef.current = result.document;
            shouldSaveOnPageHideRef.current = true;
            setDocument(result.document);
        }
        setIsStorageReady(true);
    }, []);

    useEffect(() => {
        if (!isStorageReady || !isDirtyRef.current) return;

        const timeout = window.setTimeout(() => {
            if (saveRoomCanvasDocument(document)) isDirtyRef.current = false;
        }, STORAGE_SAVE_DELAY);

        return () => window.clearTimeout(timeout);
    }, [document, isStorageReady]);

    useEffect(() => {
        if (!isStorageReady) return;

        const handlePageHide = () => {
            if (!shouldSaveOnPageHideRef.current) return;
            if (saveRoomCanvasDocument(documentRef.current)) isDirtyRef.current = false;
        };

        window.addEventListener('pagehide', handlePageHide);
        return () => window.removeEventListener('pagehide', handlePageHide);
    }, [isStorageReady]);

    const updateHistoryAvailability = useCallback(() => {
        setCanUndo(historyRef.current.past.length > 0);
        setCanRedo(historyRef.current.future.length > 0);
    }, []);

    const replaceContent = useCallback(
        (nextContent: CanvasContent) => {
            replaceDocument({ ...documentRef.current, ...nextContent }, true);
        },
        [replaceDocument]
    );

    const recordHistory = useCallback(
        (previousContent: CanvasContent, nextContent: CanvasContent) => {
            if (areCanvasContentsEqual(previousContent, nextContent)) return false;

            const history = historyRef.current;
            history.past.push(previousContent);
            if (history.past.length > HISTORY_LIMIT) history.past.shift();
            history.future = [];
            updateHistoryAvailability();
            return true;
        },
        [updateHistoryAvailability]
    );

    const commitContent = useCallback(
        (nextContent: CanvasContent) => {
            const currentContent = getCanvasContent(documentRef.current);
            if (!recordHistory(currentContent, nextContent)) return false;
            replaceContent(nextContent);
            return true;
        },
        [recordHistory, replaceContent]
    );

    const replaceRooms = useCallback(
        (rooms: Room[]) => {
            replaceContent({ ...getCanvasContent(documentRef.current), rooms });
        },
        [replaceContent]
    );

    const commitRooms = useCallback(
        (rooms: Room[]) => commitContent({ ...getCanvasContent(documentRef.current), rooms }),
        [commitContent]
    );

    const recordContentHistory = useCallback(
        (previousContent: CanvasContent) => {
            return recordHistory(previousContent, getCanvasContent(documentRef.current));
        },
        [recordHistory]
    );

    const reserveRoomSequence = useCallback(() => {
        const current = documentRef.current;
        const room = current.counters.room + 1;
        replaceDocument({ ...current, counters: { ...current.counters, room } }, true);
        return room;
    }, [replaceDocument]);

    const reserveFurnitureSequence = useCallback(() => {
        const current = documentRef.current;
        const furniture = current.counters.furniture + 1;
        replaceDocument({ ...current, counters: { ...current.counters, furniture } }, true);
        return furniture;
    }, [replaceDocument]);

    const reserveStorageDeviceSequence = useCallback(() => {
        const current = documentRef.current;
        const storageDevice = current.counters.storageDevice + 1;
        replaceDocument({ ...current, counters: { ...current.counters, storageDevice } }, true);
        return storageDevice;
    }, [replaceDocument]);

    const reserveItemSequence = useCallback(() => {
        const current = documentRef.current;
        const item = current.counters.item + 1;
        replaceDocument({ ...current, counters: { ...current.counters, item } }, true);
        return item;
    }, [replaceDocument]);

    const restoreContent = useCallback(
        (content: CanvasContent) => {
            replaceContent(content);
            return content;
        },
        [replaceContent]
    );

    const undo = useCallback(() => {
        const history = historyRef.current;
        const previousContent = history.past.pop();
        if (!previousContent) return null;

        history.future.push(getCanvasContent(documentRef.current));
        const restoredContent = restoreContent(previousContent);
        updateHistoryAvailability();
        return restoredContent;
    }, [restoreContent, updateHistoryAvailability]);

    const redo = useCallback(() => {
        const history = historyRef.current;
        const nextContent = history.future.pop();
        if (!nextContent) return null;

        history.past.push(getCanvasContent(documentRef.current));
        if (history.past.length > HISTORY_LIMIT) history.past.shift();
        const restoredContent = restoreContent(nextContent);
        updateHistoryAvailability();
        return restoredContent;
    }, [restoreContent, updateHistoryAvailability]);

    return {
        document,
        documentRef,
        canUndo,
        canRedo,
        replaceContent,
        replaceRooms,
        commitRooms,
        commitContent,
        recordContentHistory,
        reserveRoomSequence,
        reserveFurnitureSequence,
        reserveStorageDeviceSequence,
        reserveItemSequence,
        undo,
        redo,
    };
}
