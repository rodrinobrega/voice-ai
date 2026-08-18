/**
 * Ambient declaration for single-file components.
 *
 * Nuxt/Vite provide this through `vue/dist/vue.d.ts` + the generated
 * `.nuxt/nuxt.d.ts` at build time, but the Jest program (see
 * `tsconfig.jest.json`) compiles the sources directly, so `import Foo from
 * './Foo.vue'` in a component test needs a declaration of its own.
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
