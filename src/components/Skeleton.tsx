/** Siluetas de carga con la misma forma que el contenido real, para que nada salte al aparecer. */

export function Skel({
  w = '100%',
  h = 14,
  r = 6,
  className = '',
  style,
}: {
  w?: number | string;
  h?: number | string;
  r?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return <span className={`skel ${className}`} style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />;
}

/** Contenedor accesible: avisa que está cargando sin leer las siluetas. */
function Loading({ children, className, label }: { children: React.ReactNode; className: string; label: string }) {
  return (
    <div className={className} role="status" aria-busy="true" aria-label={label}>
      {children}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <Loading className="dash-skeleton" label="Cargando tu resumen">
      <header className="dash-head">
        <div>
          <Skel w={190} h={34} r={8} />
          <Skel w={150} h={12} style={{ marginTop: 10 }} />
        </div>
        <Skel w={150} h={36} r={10} />
      </header>
      <div className="dash-grid">
        <div className="card heat-card">
          <div className="heat-head">
            <div>
              <Skel w={80} h={11} />
              <Skel w={210} h={48} r={8} style={{ marginTop: 8 }} />
              <Skel w={170} h={11} style={{ marginTop: 8 }} />
            </div>
            <Skel w={90} h={32} r={8} />
          </div>
          <div className="skel-heat">
            {Array.from({ length: 7 * 26 }, (_, i) => (
              <Skel key={i} w={13} h={13} r={3} />
            ))}
          </div>
        </div>
        <div className="tiles">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="tile">
              <Skel w={70} h={11} />
              <Skel w={90} h={26} r={6} style={{ marginTop: 6 }} />
              <Skel w={110} h={11} style={{ marginTop: 6 }} />
            </div>
          ))}
        </div>
        <div className="card">
          <Skel w={120} h={15} style={{ marginBottom: 18 }} />
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="skel-row">
              <Skel w={18} h={18} r={5} />
              <Skel w={40} h={40} r={8} />
              <div className="skel-lines">
                <Skel w="70%" h={13} />
                <Skel w="45%" h={11} />
              </div>
            </div>
          ))}
        </div>
        <div className="card">
          <Skel w={120} h={15} style={{ marginBottom: 18 }} />
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="skel-row">
              <Skel w={40} h={52} r={4} />
              <div className="skel-lines">
                <Skel w="65%" h={13} />
                <Skel w="40%" h={11} />
                <Skel w="100%" h={6} r={3} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Loading>
  );
}

export function ShelfSkeleton() {
  return (
    <Loading className="shelf-skeleton" label="Cargando tus apuntes">
      <div className="folder-bar">
        {[70, 110, 90, 130].map((w, i) => (
          <Skel key={i} w={w} h={34} r={10} />
        ))}
      </div>
      <div className="books">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="book">
            <Skel className="skel-cover" w="100%" h="auto" r={6} />
            <Skel w="80%" h={13} style={{ marginTop: 12 }} />
            <Skel w="45%" h={11} style={{ marginTop: 6 }} />
          </div>
        ))}
      </div>
    </Loading>
  );
}

export function EvalListSkeleton() {
  return (
    <Loading className="eval-list" label="Cargando parciales y TPs">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="eval-card skel-card">
          <Skel w={40} h={36} r={8} style={{ justifySelf: 'center' }} />
          <div className="skel-lines">
            <Skel w="55%" h={15} />
            <Skel w="35%" h={11} />
          </div>
          <Skel w={38} h={18} />
        </div>
      ))}
    </Loading>
  );
}

/** Página en blanco con renglones, mientras se abre (o se baja) el PDF. */
export function PageSkeleton({ label }: { label: string }) {
  return (
    <Loading className="page-skeleton" label={label}>
      <div className="skel-page">
        <Skel w="55%" h={20} r={4} />
        {Array.from({ length: 14 }, (_, i) => (
          <Skel key={i} w={i % 4 === 3 ? '62%' : '100%'} h={9} r={3} style={{ marginTop: i % 4 === 0 ? 22 : 10 }} />
        ))}
      </div>
      <p className="skel-caption">{label}</p>
    </Loading>
  );
}
