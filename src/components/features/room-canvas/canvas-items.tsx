'use client';

import { useEffect, useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ItemIcon } from '@/components/ui/icons';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils/cn';
import type { Furniture, Item, ItemLocation, Room, StorageDevice } from '@/lib/types/room-canvas';

import styles from './canvas-actions.module.css';

interface ItemSectionProps {
    items: Item[];
    highlightedItemId: string | null;
    onEdit: (itemId: string) => void;
    onDelete: (itemId: string) => void;
}

interface ItemDialogProps {
    open: boolean;
    item: Item | null;
    initialLocation: ItemLocation | null;
    rooms: Room[];
    furniture: Furniture[];
    storageDevices: StorageDevice[];
    onConfirm: (value: Omit<Item, 'id'>) => void;
    onClose: () => void;
}

function getLocationValue(location: ItemLocation): string {
    if (location.kind === 'room') return `room:${location.roomId}`;
    if (location.kind === 'furniture') return `furniture:${location.furnitureId}`;
    return `storage-device:${location.storageDeviceId}`;
}

function parseLocationValue(value: string): ItemLocation | null {
    const [kind, id] = value.split(':');
    if (!id) return null;
    if (kind === 'room') return { kind, roomId: id };
    if (kind === 'furniture') return { kind, furnitureId: id };
    if (kind === 'storage-device') return { kind, storageDeviceId: id };
    return null;
}

export function ItemSection({ items, highlightedItemId, onEdit, onDelete }: ItemSectionProps) {
    if (items.length === 0) {
        return <p className={styles.detailEmpty}>还没有直接放在这里的物品。</p>;
    }

    return (
        <div className={styles.itemList}>
            {items.map((item) => (
                <div
                    key={item.id}
                    className={cn(styles.itemEntry, highlightedItemId === item.id && styles.itemEntryHighlighted)}
                    data-highlighted={highlightedItemId === item.id ? 'true' : undefined}
                >
                    <span className={styles.itemGlyph} aria-hidden="true">
                        <ItemIcon />
                    </span>
                    <span className={styles.itemText}>
                        <strong>{item.name}</strong>
                        <span>数量 × {item.quantity}</span>
                    </span>
                    <span className={styles.itemActions}>
                        <Button
                            type="button"
                            size="small"
                            aria-label={`编辑${item.name}`}
                            onClick={() => onEdit(item.id)}
                        >
                            编辑
                        </Button>
                        <Button
                            type="button"
                            variant="danger"
                            size="small"
                            aria-label={`删除${item.name}`}
                            onClick={() => onDelete(item.id)}
                        >
                            删除
                        </Button>
                    </span>
                </div>
            ))}
        </div>
    );
}

export function ItemDialog({
    open,
    item,
    initialLocation,
    rooms,
    furniture,
    storageDevices,
    onConfirm,
    onClose,
}: ItemDialogProps) {
    const nameId = useId();
    const quantityId = useId();
    const locationId = useId();
    const initialLocationValue = item
        ? getLocationValue(item.location)
        : initialLocation
          ? getLocationValue(initialLocation)
          : '';
    const [name, setName] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [locationValue, setLocationValue] = useState('');
    const roomById = new Map(rooms.map((room) => [room.id, room]));
    const furnitureById = new Map(furniture.map((entry) => [entry.id, entry]));

    useEffect(() => {
        if (!open) return;
        setName(item?.name ?? '');
        setQuantity(item?.quantity ?? 1);
        setLocationValue(initialLocationValue);
    }, [initialLocationValue, item?.id, item?.name, item?.quantity, open]);

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const location = parseLocationValue(locationValue);
        const normalizedName = name.trim();
        if (!normalizedName || !location || !Number.isInteger(quantity) || quantity < 1) return;
        onConfirm({ name: normalizedName, quantity, location });
    };

    return (
        <Dialog open={open} title={item ? '编辑物品' : '添加物品'} maxWidth="28rem" onClose={onClose}>
            <form className={styles.itemForm} onSubmit={handleSubmit}>
                <label htmlFor={nameId}>
                    物品名称
                    <Input
                        id={nameId}
                        autoComplete="off"
                        placeholder="例如：备用电池"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                    />
                </label>
                <label htmlFor={quantityId}>
                    数量
                    <Input
                        id={quantityId}
                        min={1}
                        step={1}
                        type="number"
                        value={quantity}
                        onChange={(event) => setQuantity(Number(event.target.value))}
                    />
                </label>
                <label htmlFor={locationId}>
                    存放位置
                    <select
                        className={styles.roomSelect}
                        id={locationId}
                        value={locationValue}
                        onChange={(event) => setLocationValue(event.target.value)}
                    >
                        <optgroup label="房间">
                            {rooms.map((room) => (
                                <option key={room.id} value={`room:${room.id}`}>
                                    {room.name}
                                </option>
                            ))}
                        </optgroup>
                        <optgroup label="家具">
                            {furniture.map((entry) => (
                                <option key={entry.id} value={`furniture:${entry.id}`}>
                                    {roomById.get(entry.roomId)?.name} / {entry.name}
                                </option>
                            ))}
                        </optgroup>
                        <optgroup label="储物设备">
                            {storageDevices.map((storageDevice) => {
                                const parentFurniture =
                                    storageDevice.location.kind === 'furniture'
                                        ? furnitureById.get(storageDevice.location.furnitureId)
                                        : null;
                                const room =
                                    storageDevice.location.kind === 'room'
                                        ? roomById.get(storageDevice.location.roomId)
                                        : roomById.get(parentFurniture?.roomId ?? '');
                                const path = parentFurniture ? `${room?.name} / ${parentFurniture.name}` : room?.name;
                                return (
                                    <option key={storageDevice.id} value={`storage-device:${storageDevice.id}`}>
                                        {path} / {storageDevice.name}
                                    </option>
                                );
                            })}
                        </optgroup>
                    </select>
                </label>
                <div className={styles.itemFormActions}>
                    <Button type="button" size="small" onClick={onClose}>
                        取消
                    </Button>
                    <Button
                        type="submit"
                        variant="primary"
                        size="small"
                        disabled={!name.trim() || !locationValue || !Number.isInteger(quantity) || quantity < 1}
                    >
                        {item ? '保存修改' : '添加物品'}
                    </Button>
                </div>
            </form>
        </Dialog>
    );
}
