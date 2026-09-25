// Los campos opcionales son solo para usuarios internos: al rol CLIENTE se
// le quitan en el backend (PedidosService.soloCamposCliente), ver
// documentacion/Portal Clientes/CONSULTAS/listado-pedidos-por-tipo-de-usuario.md.
export class PedidoClienteResponseDto {
  numeroDocumento: string;
  estado: string;
  fechaCreacion: string;
  fechaEntrega: string | null;
  ordenCompra: string | null;
  referencia: string;
  descripcionItem: string;
  cantidadPedida: number;
  cantidadRemisionada: number;
  cantidadPendiente: number;
  ciudad: string;
  precioUnitario: number;
  valorPendienteSubtotal: number;
  valorPendiente: number;
  direccion: string;
  valorNeto: number;
  notas: string | null;
  numero: number;

  // Solo internos.
  // Razón social en el portal — puede diferir de la de SIESA
  // (clienteRazonSocial) y el filtro Cliente debe encontrar ambas.
  clientePortal?: string | null;
  clienteRazonSocial?: string;
  nit?: string;
  item?: number;
  cantidadDisponibleInsumo?: number;
  pesoPendiente?: number;
  volumenPendiente?: number;
  precioPeso?: number;
  plan003?: string | null;
  valorBrutoLocal?: number;
  pesoPedida?: number;
  cdv?: string | null;
  vendedor?: string;
}
