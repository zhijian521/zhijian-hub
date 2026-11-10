<script setup lang="ts">
defineProps<{ name: string }>();
const paths: Record<string, string> = {
    select: 'M5 3l14 9-7 1-3 7z',
    room: 'M4 9V4h5m6 0h5v5m0 6v5h-5M9 20H4v-5M4 12h16M12 4v16',
    door: 'M4 20V4h13v16M4 20h16M7 17V7l7-3v16l-7-3zm4-5h.01',
    window: 'M3 5h18v14H3zM3 9h18M3 15h18M12 5v14',
    hand: 'M8 12V6a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v8c0 4-2 6-6 6h-2c-2 0-3-1-4-3l-4-6a2 2 0 0 1 3-2l1 2',
    undo: 'M9 5L4 10l5 5M4 10h10a6 6 0 0 1 6 6v3',
    redo: 'M15 5l5 5-5 5m5-5H10a6 6 0 0 0-6 6v3',
    fit: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 8h8v8H8z',
    export: 'M12 15V3m-4 4l4-4 4 4M4 14v6h16v-6',
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    trash: 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
    home: 'M3 11l9-8 9 8M5 9v12h14V9M10 21v-7h4v7',
    chevron: 'M9 5l7 7-7 7',
    check: 'M5 12l4 4L19 6',
    grid: 'M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm4.8 11.8L21 21',
    close: 'M6 6l12 12M18 6L6 18',
    box: 'M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8',
    tag: 'M3 12V4h8l9 9-8 8zM7 8h.01',
    sofa: 'M4 12V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M4 12a2 2 0 0 0-2 2v4h20v-4a2 2 0 0 0-2-2M4 12h16M6 18v3m12-3v3',
    cabinet: 'M5 3h14v18H5zM5 10h14M12 3v18M9 7h.01M15 14h.01',
    house: 'M4 10l8-6 8 6v10H4zM10 20v-6h4v6',
};
</script>
<template>
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
    >
        <path :d="paths[name] || paths.home" />
    </svg>
</template>
