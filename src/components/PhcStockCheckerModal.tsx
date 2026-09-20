import { useState, useEffect, useMemo } from 'react';
import { Icon, Card } from './shared';
import {
  getMedicines,
  getDiagnosticItems,
  type MedicineItem,
  type DiagnosticItem,
} from '../api/client';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultFacilityId?: string;
  defaultFacilityName?: string;
  userRole?: 'worker' | 'patient' | 'doctor';
}

const STOCK_CACHE_KEY = 'rc_cached_phc_stock';

export default function PhcStockCheckerModal({
  isOpen,
  onClose,
  defaultFacilityId,
  defaultFacilityName = 'Sanjivani PHC',
  userRole = 'worker',
}: Props) {
  const [activeTab, setActiveTab] = useState<'medicines' | 'diagnostics'>('medicines');
  const [selectedFacility, setSelectedFacility] = useState(defaultFacilityId || 'HFR-2024-SANJIVANI');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'>('ALL');
  const [medicines, setMedicines] = useState<MedicineItem[]>([]);
  const [diagnostics, setDiagnostics] = useState<DiagnosticItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCached, setIsCached] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Available registered facilities list
  const facilities = [
    { id: 'HFR-2024-SANJIVANI', name: 'Sanjivani PHC', type: 'Primary Health Centre' },
    { id: 'HFR-2024-00891', name: 'PHC Lunkaransar', type: 'Primary Health Centre' },
    { id: 'HFR-2024-00289', name: 'CHC Bikaner', type: 'Community Health Centre' },
  ];

  // Fetch stock from API with offline fallback
  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    setLoading(true);

    async function loadStock() {
      try {
        const [medsData, diagData] = await Promise.all([
          getMedicines(undefined, undefined, selectedFacility).catch(() => []),
          getDiagnosticItems(selectedFacility).catch(() => []),
        ]);

        if (mounted) {
          if (medsData.length > 0 || diagData.length > 0) {
            setMedicines(medsData);
            setDiagnostics(diagData);
            setIsCached(false);
            const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            setLastUpdated(now);

            // Cache in local storage for offline use
            try {
              localStorage.setItem(
                `${STOCK_CACHE_KEY}_${selectedFacility}`,
                JSON.stringify({
                  medicines: medsData,
                  diagnostics: diagData,
                  updatedAt: now,
                })
              );
            } catch (e) {
              // ignore
            }
          } else {
            // Check cache
            loadFromCache();
          }
        }
      } catch (err) {
        console.warn('Network stock fetch failed, loading offline cache:', err);
        if (mounted) {
          loadFromCache();
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    function loadFromCache() {
      try {
        const cached = localStorage.getItem(`${STOCK_CACHE_KEY}_${selectedFacility}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          setMedicines(parsed.medicines || []);
          setDiagnostics(parsed.diagnostics || []);
          setLastUpdated(parsed.updatedAt || 'Earlier');
          setIsCached(true);
        }
      } catch (e) {
        // ignore
      }
    }

    loadStock();

    return () => {
      mounted = false;
    };
  }, [isOpen, selectedFacility]);

  // Filtered medicines
  const filteredMedicines = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return medicines.filter((m) => {
      const matchSearch =
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.genericName.toLowerCase().includes(q) ||
        (m.category && m.category.toLowerCase().includes(q));

      const isOut = m.stock <= 0;
      const isLow = m.stock > 0 && m.stock <= m.minStockLevel;
      const isAvailable = m.stock > m.minStockLevel;

      let matchStatus = true;
      if (statusFilter === 'IN_STOCK') matchStatus = isAvailable;
      if (statusFilter === 'LOW_STOCK') matchStatus = isLow;
      if (statusFilter === 'OUT_OF_STOCK') matchStatus = isOut;

      return matchSearch && matchStatus;
    });
  }, [medicines, searchQuery, statusFilter]);

  // Filtered diagnostic test kits
  const filteredDiagnostics = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return diagnostics.filter((d) => {
      const matchSearch =
        !q ||
        d.testName.toLowerCase().includes(q) ||
        (d.testNameHi && d.testNameHi.toLowerCase().includes(q)) ||
        (d.category && d.category.toLowerCase().includes(q));

      let matchStatus = true;
      if (statusFilter === 'IN_STOCK') matchStatus = d.status === 'AVAILABLE';
      if (statusFilter === 'LOW_STOCK') matchStatus = d.status === 'LOW_STOCK';
      if (statusFilter === 'OUT_OF_STOCK') matchStatus = d.status === 'OUT_OF_STOCK';

      return matchSearch && matchStatus;
    });
  }, [diagnostics, searchQuery, statusFilter]);

  // Overall counters
  const totalMeds = medicines.length;
  const outOfStockMeds = medicines.filter((m) => m.stock <= 0).length;
  const lowStockMeds = medicines.filter((m) => m.stock > 0 && m.stock <= m.minStockLevel).length;

  const totalKits = diagnostics.length;
  const outOfStockKits = diagnostics.filter((d) => d.status === 'OUT_OF_STOCK').length;
  const lowStockKits = diagnostics.filter((d) => d.status === 'LOW_STOCK').length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh] overflow-hidden border border-gray-100">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 via-teal-700 to-cyan-800 text-white p-5 sm:p-6 shrink-0 relative">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-white/15 backdrop-blur-md rounded-2xl flex items-center justify-center text-white border border-white/20 shadow-inner">
                <Icon name="pill" size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-display text-lg sm:text-xl font-bold">
                    PHC Stock & Diagnostic Availability
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white border border-white/20">
                    Live Dispensary
                  </span>
                </div>
                <p className="text-emerald-100 text-xs mt-0.5">
                  Verify essential medicine stock and lab testing kits before patient travel
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer shrink-0"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Facility Selector & Network Status Bar */}
          <div className="mt-4 pt-3 border-t border-white/15 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-[11px] text-emerald-100 font-medium shrink-0">Facility:</span>
              <select
                value={selectedFacility}
                onChange={(e) => setSelectedFacility(e.target.value)}
                className="bg-white/15 hover:bg-white/20 text-white text-xs font-semibold rounded-xl px-2.5 py-1.5 border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/40 cursor-pointer w-full sm:w-auto"
              >
                {facilities.map((fac) => (
                  <option key={fac.id} value={fac.id} className="text-gray-900 bg-white">
                    🏥 {fac.name} ({fac.type})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-emerald-100 self-end sm:self-center">
              {isCached ? (
                <span className="inline-flex items-center gap-1 text-amber-200 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-300/30">
                  <Icon name="wifi_off" size={11} />
                  Offline Cache ({lastUpdated})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-emerald-200 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-300/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                  Live Sync ({lastUpdated || 'Connected'})
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tab switcher: Medicines vs Diagnostics */}
        <div className="px-5 pt-4 pb-2 bg-gray-50 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex p-1 bg-gray-200/80 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveTab('medicines')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'medicines'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Icon name="pill" size={14} />
                Essential Medicines
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  activeTab === 'medicines' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-300 text-gray-700'
                }`}>
                  {totalMeds}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('diagnostics')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'diagnostics'
                    ? 'bg-white text-teal-800 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Icon name="clipboard" size={14} />
                Diagnostic Test Kits
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  activeTab === 'diagnostics' ? 'bg-teal-100 text-teal-800' : 'bg-gray-300 text-gray-700'
                }`}>
                  {totalKits}
                </span>
              </button>
            </div>

            {/* Critical shortage indicator badge */}
            {(outOfStockMeds > 0 || outOfStockKits > 0) && (
              <div className="flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-xl">
                <span className="text-amber-600 font-bold">⚠️</span>
                <span>
                  {activeTab === 'medicines'
                    ? `${outOfStockMeds} item(s) out of stock`
                    : `${outOfStockKits} kit(s) unavailable`}
                </span>
              </div>
            )}
          </div>

          {/* Search & Stock Filter */}
          <div className="mt-3 flex flex-col sm:flex-row gap-2 pb-2">
            <div className="relative flex-1">
              <Icon
                name="search"
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  activeTab === 'medicines'
                    ? 'Search medicines (e.g. Paracetamol, ORS, Amoxicillin)...'
                    : 'Search lab kits (e.g. Malaria RDT, Hemoglobin, Glucose)...'
                }
                className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
              {[
                { id: 'ALL', label: 'All' },
                { id: 'IN_STOCK', label: '✓ In Stock' },
                { id: 'LOW_STOCK', label: '⚠️ Low Stock' },
                { id: 'OUT_OF_STOCK', label: '✕ Out of Stock' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id as any)}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    statusFilter === f.id
                      ? 'bg-gray-900 text-white'
                      : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 divide-y divide-gray-100 space-y-2">
          {loading ? (
            <div className="py-16 text-center text-gray-400 text-xs flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <span>Fetching dispensary inventory from PostgreSQL...</span>
            </div>
          ) : activeTab === 'medicines' ? (
            filteredMedicines.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-xs">
                <Icon name="pill" size={32} className="mx-auto text-gray-300 mb-2" />
                <p className="font-semibold text-gray-600">No medicines found</p>
                <p className="text-gray-400 mt-1">Try adjusting your search query or status filter.</p>
              </div>
            ) : (
              filteredMedicines.map((med) => {
                const isOut = med.stock <= 0;
                const isLow = med.stock > 0 && med.stock <= med.minStockLevel;

                return (
                  <div
                    key={med.id}
                    className="pt-2.5 pb-2.5 flex items-center justify-between gap-3 hover:bg-gray-50/80 px-2 rounded-xl transition-colors"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
                          isOut
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : isLow
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        💊
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-gray-900">
                            {med.name}
                          </span>
                          {med.strength && (
                            <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.2 rounded font-mono">
                              {med.strength}
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] text-gray-500 truncate">
                          {med.genericName}
                          {med.category && ` · ${med.category}`}
                        </div>

                        <div className="text-[10px] text-gray-400 mt-0.5">
                          Dosage Form: <span className="text-gray-600 font-medium">{med.dosageForm}</span>
                          {med.expiryDate && (
                            <span className="ml-2 text-gray-400">Exp: {med.expiryDate}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {isOut ? (
                        <div className="inline-flex flex-col items-end">
                          <span className="px-2.5 py-1 bg-red-100 text-red-800 border border-red-200 rounded-lg text-xs font-bold">
                            ✕ Out of Stock
                          </span>
                          <span className="text-[10px] text-red-600 font-medium mt-0.5">
                            Outside Sourcing Req.
                          </span>
                        </div>
                      ) : isLow ? (
                        <div className="inline-flex flex-col items-end">
                          <span className="px-2.5 py-1 bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold">
                            ⚠️ Low: {med.stock} units
                          </span>
                          <span className="text-[10px] text-amber-700 font-medium mt-0.5">
                            Reorder Threshold: {med.minStockLevel}
                          </span>
                        </div>
                      ) : (
                        <div className="inline-flex flex-col items-end">
                          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold">
                            ✓ Available: {med.stock}
                          </span>
                          <span className="text-[10px] text-emerald-700 font-medium mt-0.5">
                            Dispense at PHC
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )
          ) : (
            filteredDiagnostics.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-xs">
                <Icon name="clipboard" size={32} className="mx-auto text-gray-300 mb-2" />
                <p className="font-semibold text-gray-600">No diagnostic kits found</p>
                <p className="text-gray-400 mt-1">Try adjusting your search query or status filter.</p>
              </div>
            ) : (
              filteredDiagnostics.map((kit) => {
                const isOut = kit.status === 'OUT_OF_STOCK' || kit.kitsAvailable <= 0;
                const isLow = kit.status === 'LOW_STOCK';

                return (
                  <div
                    key={kit.id}
                    className="pt-2.5 pb-2.5 flex items-center justify-between gap-3 hover:bg-gray-50/80 px-2 rounded-xl transition-colors"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
                          isOut
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : isLow
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-teal-50 text-teal-700 border border-teal-200'
                        }`}
                      >
                        🔬
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-gray-900">
                            {kit.testName}
                          </span>
                          <span className="text-[10px] text-teal-800 bg-teal-50 border border-teal-100 px-1.5 py-0.2 rounded font-medium">
                            {kit.category}
                          </span>
                        </div>

                        {kit.testNameHi && (
                          <div className="text-[11px] text-teal-700 font-hindi mt-0.5">
                            {kit.testNameHi}
                          </div>
                        )}

                        <div className="text-[10px] text-gray-400 mt-0.5">
                          Kit Code: <span className="font-mono text-gray-600">{kit.code}</span>
                          {kit.expiryDate && (
                            <span className="ml-2 text-gray-400">Exp: {kit.expiryDate}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {isOut ? (
                        <div className="inline-flex flex-col items-end">
                          <span className="px-2.5 py-1 bg-red-100 text-red-800 border border-red-200 rounded-lg text-xs font-bold">
                            ✕ Unavailable
                          </span>
                          <span className="text-[10px] text-red-600 font-medium mt-0.5">
                            Lab Testing Paused
                          </span>
                        </div>
                      ) : isLow ? (
                        <div className="inline-flex flex-col items-end">
                          <span className="px-2.5 py-1 bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold">
                            ⚠️ {kit.kitsAvailable} kits left
                          </span>
                          <span className="text-[10px] text-amber-700 font-medium mt-0.5">
                            Prioritize High-Risk
                          </span>
                        </div>
                      ) : (
                        <div className="inline-flex flex-col items-end">
                          <span className="px-2.5 py-1 bg-teal-100 text-teal-800 border border-teal-200 rounded-lg text-xs font-bold">
                            ✓ {kit.kitsAvailable} kits ready
                          </span>
                          <span className="text-[10px] text-teal-700 font-medium mt-0.5">
                            Same-Day Lab Results
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )
          )}
        </div>

        {/* Footer info */}
        <div className="bg-gray-50 px-5 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Facility: <strong className="text-gray-700">{facilities.find(f => f.id === selectedFacility)?.name || defaultFacilityName}</strong></span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-900 hover:bg-black text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
