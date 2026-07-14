# Guía de Uso de Modales Genéricas

## Introducción

El proyecto ahora utiliza dos componentes de modal reutilizables en lugar de `alert()` y `confirm()` del navegador:
- `ConfirmModal` - Para confirmaciones y errores
- `SuccessModal` - Para mensajes de éxito

## Componentes

### ConfirmModal

```tsx
<ConfirmModal
  isOpen={boolean}
  title={string}
  message={string}
  confirmText={string}              // Default: "Confirmar"
  cancelText={string}               // Default: "Cancelar"
  isDangerous={boolean}             // Default: false (rojo si true)
  isLoading={boolean}               // Default: false
  onConfirm={() => void | Promise}
  onCancel={() => void}
/>
```

**Casos de uso:**
- `isDangerous=false` → Confirmaciones normales
- `isDangerous=true` → Errores, confirmaciones peligrosas (eliminar, etc.)

### SuccessModal

```tsx
<SuccessModal
  isOpen={boolean}
  title={string}
  message={string}
  actionText={string}               // Default: "Aceptar"
  onAction={() => void}
  autoClose={boolean}               // Default: false
  autoCloseDelay={number}           // Default: 3000ms
/>
```

## Ejemplo de Implementación

### Antes (sin refactorizar):

```tsx
const handleDelete = async (id: number) => {
  if (!confirm('¿Eliminar?')) return;
  
  try {
    await service.delete(id);
    alert('Eliminado exitosamente');
  } catch (error) {
    alert('Error al eliminar');
  }
};
```

### Después (refactorizado):

```tsx
const [modalState, setModalState] = useState<{
  isOpen: boolean;
  type: 'error' | 'success' | 'confirm';
  title: string;
  message: string;
  action?: () => void;
  isDangerous?: boolean;
}>({
  isOpen: false,
  type: 'error',
  title: '',
  message: '',
});

const handleDelete = (id: number) => {
  setModalState({
    isOpen: true,
    type: 'confirm',
    title: 'Eliminar',
    message: '¿Estás seguro de eliminar?',
    isDangerous: true,
    action: async () => {
      try {
        await service.delete(id);
        setModalState({
          isOpen: true,
          type: 'success',
          title: 'Éxito',
          message: 'Eliminado exitosamente',
        });
      } catch (error) {
        setModalState({
          isOpen: true,
          type: 'error',
          title: 'Error',
          message: 'Error al eliminar',
        });
      }
    },
  });
};

// Al final del JSX:
return (
  <>
    {/* contenido */}
    
    {modalState.type === 'error' && (
      <ConfirmModal
        isOpen={modalState.isOpen}
        title={modalState.title}
        message={modalState.message}
        confirmText="Aceptar"
        isDangerous={true}
        onConfirm={() => setModalState({ ...modalState, isOpen: false })}
        onCancel={() => setModalState({ ...modalState, isOpen: false })}
      />
    )}

    {modalState.type === 'success' && (
      <SuccessModal
        isOpen={modalState.isOpen}
        title={modalState.title}
        message={modalState.message}
        actionText="Aceptar"
        onAction={() => setModalState({ ...modalState, isOpen: false })}
      />
    )}

    {modalState.type === 'confirm' && (
      <ConfirmModal
        isOpen={modalState.isOpen}
        title={modalState.title}
        message={modalState.message}
        confirmText="Confirmar"
        isDangerous={modalState.isDangerous}
        onConfirm={async () => {
          if (modalState.action) await modalState.action();
          setModalState({ ...modalState, isOpen: false });
        }}
        onCancel={() => setModalState({ ...modalState, isOpen: false })}
      />
    )}
  </>
);
```

## Reglas

1. **alert() → SuccessModal o ConfirmModal**
   - Si es éxito: usa SuccessModal
   - Si es error: usa ConfirmModal con isDangerous=true

2. **confirm() → ConfirmModal**
   - Siempre usa ConfirmModal
   - isDangerous=true si es acción peligrosa (eliminar, etc.)
   - isDangerous=false si es confirmación normal

3. **Mantener lógica intacta**
   - Solo cambiar la presentación del mensaje
   - La lógica de negocio permanece igual

## Referencias

- `ConfirmModal`: `/src/components/modals/ConfirmModal.tsx`
- `SuccessModal`: `/src/components/modals/SuccessModal.tsx`

## Archivos Completamente Refactorizados

Ver `REFACTORING_MODALES_RESUMEN.txt`
