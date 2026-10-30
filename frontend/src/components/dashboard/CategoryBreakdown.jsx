import { useState } from 'react';
import { formatPrice } from '../../utils/formatters';
import { ACTIVE_LOT_STATUSES } from '../../utils/constants';

export default function CategoryBreakdown({ allLots, lots, selectedUserId, isCommercial }) {
  const [catRepTab, setCatRepTab] = useState('type_lot'); // 'type_lot' | 'emplacement' | 'type_maison' | 'zone'

  const CAT_TABS = [
    {
      key: 'type_lot', label: 'Type de Lot', ex: 'Résidentiel, Commercial…',
      icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>,
    },
    {
      key: 'emplacement', label: 'Emplacement', ex: '2 façades, 3 façades…',
      icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2C5.8 2 4 3.8 4 6c0 3.3 4 8 4 8s4-4.7 4-8c0-2.2-1.8-4-4-4z"/><circle cx="8" cy="6" r="1.5"/></svg>,
    },
    {
      key: 'type_maison', label: 'Type de Maison', ex: 'Villa, Appartement…',
      icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 7L8 2l6 5"/><path d="M3 7v6h4v-3h2v3h4V7"/></svg>,
    },
    {
      key: 'zone', label: 'Zone', ex: 'A, B, C…',
      icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2h7l3 3v9H3V2z"/><path d="M10 2v3h3"/></svg>,
    },
  ];

  // Mode : vue commerciale (filtre user actif) ou vue globale
  const hasUserFilter = isCommercial() || !!selectedUserId;
  // IDs des lots appartenant au commercial/user filtré
  const myLotIds = hasUserFilter ? new Set(lots.map(l => l.id)) : null;
  // Base = TOUS les lots du projet (pas filtrés par user)
  const chartLots = allLots.length > 0 ? allLots : lots;

  // Agrégation sur tous les lots du projet
  const groups = {};
  chartLots.forEach(lot => {
    const key = lot[catRepTab] || 'Non défini';
    if (!groups[key]) {
      groups[key] = {
        name: key,
        // Active pipeline buckets
        en_cours: 0, chez_proprietaire: 0, available: 0, blocked: 0,
        amount_en_cours: 0, amount_chez_proprietaire: 0, amount_available: 0, amount_blocked: 0,
        // Commercial view
        mine_en_cours: 0, mine_proprietaire: 0,
        amount_mine_en_cours: 0, amount_mine_proprietaire: 0,
        others: 0, amount_others: 0,
        amount_total: 0,
      };
    }
    const price = parseFloat(lot.price) || 0;
    groups[key].amount_total += price;
    const ACTIVE = ACTIVE_LOT_STATUSES.filter(st => st !== 'chez_proprietaire');

    if (hasUserFilter) {
      const isMine = myLotIds.has(lot.id);
      if (isMine && lot.status === 'chez_proprietaire') {
        groups[key].mine_proprietaire++;
        groups[key].amount_mine_proprietaire += price;
        groups[key].chez_proprietaire++;
        groups[key].amount_chez_proprietaire += price;
      } else if (isMine && ACTIVE.includes(lot.status)) {
        groups[key].mine_en_cours++;
        groups[key].amount_mine_en_cours += price;
        groups[key].en_cours++;
        groups[key].amount_en_cours += price;
      } else if (lot.status === 'available' || lot.status === 'creation') {
        groups[key].available++;
        groups[key].amount_available += price;
      } else {
        groups[key].others++;
        groups[key].amount_others += price;
      }
    } else {
      // Vue manager : tous les statuts normalement
      groups[key][lot.status] = (groups[key][lot.status] || 0) + 1;
      groups[key][`amount_${lot.status}`] = (groups[key][`amount_${lot.status}`] || 0) + price;
    }
  });

  const catStats = Object.values(groups).sort((a, b) => b.amount_total - a.amount_total);
  const grandTotal = catStats.reduce((s, g) => s + g.amount_total, 0) || 1;
  const grandSold = catStats.reduce((s, g) => s + (g.chez_proprietaire || 0), 0);
  const grandReserved = catStats.reduce((s, g) => s + (g.en_cours || 0), 0);
  const grandAvailable = catStats.reduce((s, g) => s + (g.available || 0), 0);
  const grandBlocked = catStats.reduce((s, g) => s + (g.blocked || 0), 0);
  const amountSold = catStats.reduce((s, g) => s + (g.amount_chez_proprietaire || 0), 0);
  const amountReserved = catStats.reduce((s, g) => s + (g.amount_en_cours || 0), 0);
  const amountAvailable = catStats.reduce((s, g) => s + (g.amount_available || 0), 0);
  const amountBlocked = catStats.reduce((s, g) => s + (g.amount_blocked || 0), 0);
  const grandOthers = catStats.reduce((s, g) => s + g.others, 0);
  const amountOthers = catStats.reduce((s, g) => s + g.amount_others, 0);

  return (
    <div className="kpis-section-v2" style={{ marginBottom: 'var(--spacing-lg)' }}>
      {/* En-tête */}
      <div className="kpis-section-header">
        <h3>
          <span className="kpis-section-icon">◈</span>
          Répartition par catégorie
        </h3>
        <span className="kpis-section-badge num" title="Valeur catalogue de tous les lots (vendus + réservés + disponibles + bloqués)">
          Portefeuille {formatPrice(grandTotal)}
        </span>
      </div>

      {/* Onglets catégorie — pills avec icônes */}
      <div className="rep-pills">
        {CAT_TABS.map(tab => (
          <button
            key={tab.key}
            className={`rep-pill${catRepTab === tab.key ? ' active' : ''}`}
            onClick={() => setCatRepTab(tab.key)}
            title={tab.ex}
          >
            {tab.icon}
            {tab.label}
            {catRepTab === tab.key && <span className="rep-pill-dot"/>}
          </button>
        ))}
      </div>

      {/* Résumé rapide */}
      <div className="rep-summary-row">
        {grandSold > 0 && (
          <span className="rep-summary-pill sold" title={hasUserFilter ? 'Mes ventes' : `${grandSold} lot${grandSold > 1 ? 's' : ''} vendus`}>
            <span className="rep-dot sold"/>
            {hasUserFilter ? 'Mes ventes' : `${grandSold} vendu${grandSold > 1 ? 's' : ''}`}
            <span className="rep-summary-amount">{formatPrice(amountSold)}</span>
          </span>
        )}
        {grandReserved > 0 && (
          <span className="rep-summary-pill reserved" title={hasUserFilter ? 'Mes réservations actives' : `${grandReserved} lot${grandReserved > 1 ? 's' : ''} réservés`}>
            <span className="rep-dot reserved"/>
            {hasUserFilter ? 'Mes réservations' : `${grandReserved} réservé${grandReserved > 1 ? 's' : ''}`}
            <span className="rep-summary-amount">{formatPrice(amountReserved)}</span>
          </span>
        )}
        {grandAvailable > 0 && (
          <span className="rep-summary-pill available" title={`${grandAvailable} lot${grandAvailable > 1 ? 's' : ''} disponibles`}>
            <span className="rep-dot available"/>
            {grandAvailable} disponible{grandAvailable > 1 ? 's' : ''}
            {amountAvailable > 0 && <span className="rep-summary-amount">{formatPrice(amountAvailable)}</span>}
          </span>
        )}
        {grandBlocked > 0 && !hasUserFilter && (
          <span className="rep-summary-pill blocked">
            <span className="rep-dot blocked"/>
            {grandBlocked} bloqué{grandBlocked > 1 ? 's' : ''}
            {amountBlocked > 0 && <span className="rep-summary-amount">{formatPrice(amountBlocked)}</span>}
          </span>
        )}
        {hasUserFilter && grandOthers > 0 && (
          <span className="rep-summary-pill others" title="Lots vendus ou réservés par d'autres commerciaux">
            <span className="rep-dot others"/>
            {grandOthers} autre{grandOthers > 1 ? 's' : ''}
            {amountOthers > 0 && <span className="rep-summary-amount">{formatPrice(amountOthers)}</span>}
          </span>
        )}
      </div>

      {/* Corps : liste des catégories */}
      <div className="rep-body">
        {catStats.length > 0 ? catStats.map(group => {
          const totalCount = group.sold + group.reserved + group.available + group.blocked + group.others;
          // % du groupe dans le portefeuille total (en valeur)
          const displayPct = Math.round((group.amount_total / grandTotal) * 100);
          // Barre toujours 100% — segments montrent la composition interne
          // Pour la vue commerciale : part du commercial dans CE groupe
          const mineCount = group.mine_sold + group.mine_reserved;
          const minePct = totalCount > 0 ? Math.round((mineCount / totalCount) * 100) : 0;

          return (
            <div key={group.name} className="rep-row">
              {/* Nom + méta alignés */}
              <div className="rep-row-header">
                <span className="rep-row-name">{group.name}</span>
                <div className="rep-row-meta">
                  <span className="rep-row-count num">{totalCount} lot{totalCount > 1 ? 's' : ''}</span>
                  {hasUserFilter ? (
                    <span className="rep-row-pct num" title={`${mineCount} lot${mineCount > 1 ? 's' : ''} vendus ou réservés par moi sur ${totalCount} dans cette catégorie`}>
                      {minePct}% capturé{minePct > 0 && mineCount > 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className="rep-row-pct num">{displayPct}%</span>
                  )}
                  <span className="rep-row-amount num">{formatPrice(group.amount_total)}</span>
                </div>
              </div>
              {/* Barre segmentée 100% — segments proportionnels aux montants */}
              <div className="rep-row-bar-wrap">
                <div className="rep-row-bar-inner" style={{ width: '100%' }}>
                  {hasUserFilter ? (
                    <>
                      {group.amount_mine_sold > 0 && <div className="rep-row-seg sold" style={{ flex: group.amount_mine_sold }} title={`Mes ventes: ${formatPrice(group.amount_mine_sold)}`}/>}
                      {group.amount_mine_reserved > 0 && <div className="rep-row-seg reserved" style={{ flex: group.amount_mine_reserved }} title={`Mes réservations: ${formatPrice(group.amount_mine_reserved)}`}/>}
                      {group.amount_available > 0 && <div className="rep-row-seg available" style={{ flex: group.amount_available }} title={`Disponibles: ${formatPrice(group.amount_available)}`}/>}
                      {group.amount_others > 0 && <div className="rep-row-seg others" style={{ flex: group.amount_others }} title={`Autres commerciaux: ${formatPrice(group.amount_others)}`}/>}
                    </>
                  ) : (
                    <>
                      {group.amount_sold > 0 && <div className="rep-row-seg sold" style={{ flex: group.amount_sold }}/>}
                      {group.amount_reserved > 0 && <div className="rep-row-seg reserved" style={{ flex: group.amount_reserved }}/>}
                      {group.amount_available > 0 && <div className="rep-row-seg available" style={{ flex: group.amount_available }}/>}
                      {group.amount_blocked > 0 && <div className="rep-row-seg blocked" style={{ flex: group.amount_blocked }}/>}
                    </>
                  )}
                </div>
              </div>
              {/* Badges de détail par statut */}
              <div className="rep-row-badges">
                {hasUserFilter ? (
                  <>
                    {group.mine_sold > 0 && (
                      <span className="rep-badge sold">
                        <span className="rep-dot sold"/>
                        {group.mine_sold} vendu{group.mine_sold > 1 ? 's' : ''} (moi)
                        <span className="rep-badge-amount">{formatPrice(group.amount_mine_sold)}</span>
                      </span>
                    )}
                    {group.mine_reserved > 0 && (
                      <span className="rep-badge reserved">
                        <span className="rep-dot reserved"/>
                        {group.mine_reserved} réservé{group.mine_reserved > 1 ? 's' : ''} (moi)
                        <span className="rep-badge-amount">{formatPrice(group.amount_mine_reserved)}</span>
                      </span>
                    )}
                    {group.available > 0 && (
                      <span className="rep-badge available">
                        <span className="rep-dot available"/>
                        {group.available} disponible{group.available > 1 ? 's' : ''}
                      </span>
                    )}
                    {group.others > 0 && (
                      <span className="rep-badge others">
                        <span className="rep-dot others"/>
                        {group.others} autre{group.others > 1 ? 's' : ''} commerc.
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    {group.sold > 0 && (
                      <span className="rep-badge sold">
                        <span className="rep-dot sold"/>
                        {group.sold} vendu{group.sold > 1 ? 's' : ''}
                        <span className="rep-badge-amount">{formatPrice(group.amount_sold)}</span>
                      </span>
                    )}
                    {group.reserved > 0 && (
                      <span className="rep-badge reserved">
                        <span className="rep-dot reserved"/>
                        {group.reserved} réservé{group.reserved > 1 ? 's' : ''}
                        <span className="rep-badge-amount">{formatPrice(group.amount_reserved)}</span>
                      </span>
                    )}
                    {group.available > 0 && (
                      <span className="rep-badge available">
                        <span className="rep-dot available"/>
                        {group.available} disponible{group.available > 1 ? 's' : ''}
                        {group.amount_available > 0 && <span className="rep-badge-amount">{formatPrice(group.amount_available)}</span>}
                      </span>
                    )}
                    {group.blocked > 0 && (
                      <span className="rep-badge blocked">
                        <span className="rep-dot blocked"/>
                        {group.blocked} bloqué{group.blocked > 1 ? 's' : ''}
                        {group.amount_blocked > 0 && <span className="rep-badge-amount">{formatPrice(group.amount_blocked)}</span>}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        }) : (
          <div className="empty-state" style={{ padding: 'var(--spacing-lg)' }}>
            <div className="empty-state-title">Aucune donnée</div>
            <div className="empty-state-description">
              Les lots n&apos;ont pas encore de {CAT_TABS.find(t => t.key === catRepTab)?.label.toLowerCase()} renseigné.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
