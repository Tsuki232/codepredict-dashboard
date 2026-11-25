/**
 * Fondo de la aplicación, por capas (de abajo arriba): papel milimetrado que se desplaza muy despacio → dos resplandores de tinta azul y lápiz rojo
 * que respiran → grano → viñeta. Todo es CSS (transform y opacity), sin JavaScript por cuadro, y queda quieto con «reducir movimiento».
 * El estilo está en design/tokens.css (clases amb-*).
 */
export function Ambiente() {
  return (
    <div className="ambiente" aria-hidden>
      <div className="amb-malla" />
      <div className="amb-brillo amb-brillo-1" />
      <div className="amb-brillo amb-brillo-2" />
      <div className="amb-grano" />
      <div className="amb-vineta" />
    </div>
  )
}
