import { defineComponent, h } from 'vue'

export const vuetifyStubs = {
  VApp: defineComponent({
    name: 'VApp',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  VAlert: defineComponent({
    name: 'VAlert',
    setup(_, { slots }) {
      return () => h('div', { role: 'alert' }, slots.default?.())
    },
  }),
  VBtn: defineComponent({
    name: 'VBtn',
    props: {
      disabled: Boolean,
      title: String,
    },
    emits: ['click'],
    setup(props, { attrs, emit, slots }) {
      return () => h(
        'button',
        {
          ...attrs,
          disabled: props.disabled,
          title: props.title,
          type: 'button',
          onClick: (event: MouseEvent) => emit('click', event),
        },
        slots.default?.(),
      )
    },
  }),
  VCard: defineComponent({
    name: 'VCard',
    props: {
      tag: {
        type: String,
        default: 'div',
      },
    },
    emits: ['click'],
    setup(props, { attrs, emit, slots }) {
      return () => h(
        props.tag,
        {
          ...attrs,
          onClick: (event: MouseEvent) => emit('click', event),
        },
        slots.default?.(),
      )
    },
  }),
  VDialog: defineComponent({
    name: 'VDialog',
    props: {
      modelValue: Boolean,
    },
    emits: ['update:modelValue'],
    setup(props, { slots }) {
      return () => (props.modelValue ? h('div', { role: 'dialog' }, slots.default?.()) : null)
    },
  }),
  VMain: defineComponent({
    name: 'VMain',
    setup(_, { slots }) {
      return () => h('main', slots.default?.())
    },
  }),
  VSelect: defineComponent({
    name: 'VSelect',
    props: {
      modelValue: [String, Number, null],
      items: {
        type: Array,
        default: () => [],
      },
      itemTitle: {
        type: String,
        default: 'label',
      },
      itemValue: {
        type: String,
        default: 'value',
      },
    },
    emits: ['update:modelValue'],
    setup(props, { attrs, emit }) {
      return () => h(
        'select',
        {
          ...attrs,
          value: props.modelValue ?? '',
          onChange: (event: Event) => emit('update:modelValue', (event.target as HTMLSelectElement).value),
        },
        (props.items as Record<string, unknown>[]).map((item) => h('option', {
          value: String(item[props.itemValue] ?? ''),
        }, String(item[props.itemTitle] ?? ''))),
      )
    },
  }),
  VSheet: defineComponent({
    name: 'VSheet',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  VChip: defineComponent({
    name: 'VChip',
    emits: ['click'],
    setup(_, { attrs, emit, slots }) {
      return () => h('button', {
        ...attrs,
        type: 'button',
        onClick: (event: MouseEvent) => emit('click', event),
      }, slots.default?.())
    },
  }),
  VSpacer: defineComponent({
    name: 'VSpacer',
    setup() {
      return () => h('span')
    },
  }),
  VToolbar: defineComponent({
    name: 'VToolbar',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  VTextField: defineComponent({
    name: 'VTextField',
    props: {
      modelValue: String,
    },
    emits: ['update:modelValue'],
    setup(props, { attrs, emit, slots }) {
      return () => h('label', [
        slots['prepend-inner']?.(),
        h('input', {
          ...attrs,
          value: props.modelValue ?? '',
          onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
        }),
      ])
    },
  }),
  VSlider: defineComponent({
    name: 'VSlider',
    props: {
      modelValue: [String, Number],
    },
    emits: ['end', 'update:modelValue'],
    setup(props, { emit }) {
      return () => h('input', {
        type: 'range',
        value: props.modelValue ?? 0,
        onChange: (event: Event) => emit('end', (event.target as HTMLInputElement).value),
        onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
      })
    },
  }),
}
