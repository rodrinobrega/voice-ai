<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })
</script>

<template>
  <div>
    <h1 class="mb-6 text-2xl font-bold text-gray-900">Upload an audio file</h1>
    <FileUploader />
  </div>
</template>
