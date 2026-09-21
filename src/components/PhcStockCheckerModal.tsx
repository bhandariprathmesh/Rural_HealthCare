import { useState, useEffect, useMemo } from 'react';
import { Icon } from './shared';
import {
  getMedicines,
  getDiagnosticItems,
  updateMedicineStock,
  updateDiagnosticStock,
  createMedicine,
  createDiagnosticItem,
  type MedicineItem,
  type DiagnosticItem,
} from '../api/client';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultFacilityId?: string;
  defaultFacilityName?: string;
  userRole?: 'worker' | 'patient' | 'doctor' | 'admin';
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

  // Add Item Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // New Medicine form fields
  const [medName, setMedName] = useState('');
  const [medGeneric, setMedGeneric] = useState('');
  const [medBrand, setMedBrand] = useState('');
  const [medCategory, setMedCategory] = useState('Analgesic & Antipyretic');
  const [medDosageForm, setMedDosageForm] = useState('Tablet');
  const [medStrength, setMedStrength] = useState('500mg');
  const [medStock, setMedStock] = useState('100');
  const [medMinLevel, setMedMinLevel] = useState('20');
  const [medExpiry, setMedExpiry] = useState('2027-12-31');

  // New Diagnostic form fields
  const [diagName, setDiagName] = useState('');
  const [diagNameHi, setDiagNameHi] = useState('');
  const [diagCategory, setDiagCategory] = useState('Rapid Diagnostic');
  const [diagKits, setDiagKits] = useState('50');
  const [diagMinLevel, setDiagMinLevel] = useState('10');
  const [diagExpiry, setDiagExpiry] = useState('2027-12-31');

  // Editing / Restock popover state
  const [restockingId, setRestockingId] = useState<string | null>(null);
  const [restockAmount, setRestockAmount] = useState<number>(50);

  // Available registered facilities list
  const facilities = [
    { id: 'HFR-2024-SANJIVANI', name: 'Sanjivani PHC', type: 'Primary Health Centre' },
    { id: 'HFR-2024-00891', name: 'PHC Lunkaransar', type: 'Primary Health Centre' },
    { id: 'HFR-2024-00289', name: 'CHC Bikaner', type: 'Community Health Centre' },
  ];

  // Fetch stock from API with offline fallback
  const loadStock = async () => {
    setLoading(true);
    try {
      const [medsData, diagData] = await Promise.all([
        getMedicines(undefined, undefined, selectedFacility).catch(() => []),
        getDiagnosticItems(selectedFacility).catch(() => []),
      ]);

      if (medsData.length > 0 || diagData.length > 0) {
        setMedicines(medsData);
        setDiagnostics(diagData);
        setIsCached(false);
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setLastUpdated(now);

        try {
          localStorage.setItem(
            `${STOCK_CACHE_KEY}_${selectedFacility}`,
            JSON.stringify({
              medicines: medsData,
              diagnostics: diagData,
              updatedAt: now,
            })
          );
        } catch {
          // ignore
        }
      } else {
        loadFromCache();
      }
    } catch (err) {
      console.warn('Network stock fetch failed, loading offline cache:', err);
      loadFromCache();
    } finally {
      setLoading(false);
    }
  };

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
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    loadStock();
  }, [isOpen, selectedFacility]);

  // Handle Restock Increment
  const handleQuickRestock = async (item: MedicineItem | DiagnosticItem, isMed: boolean, addUnits: number) => {
    try {
      if (isMed) {
        const med = item as MedicineItem;
        const newStock = Math.max(0, med.stock + addUnits);
        const updated = await updateMedicineStock(med.id, { stock: newStock });
        setMedicines((prev) => prev.map((m) => (m.id === med.id ? { ...m, ...updated, stock: newStock } : m)));
        setActionSuccess(`✓ Restocked ${med.name}: now ${newStock} units`);
      } else {
        const diag = item as DiagnosticItem;
        const newKits = Math.max(0, diag.kitsAvailable + addUnits);
        const updated = await updateDiagnosticStock(diag.id, { kitsAvailable: newKits });
        setDiagnostics((prev) => prev.map((d) => (d.id === diag.id ? { ...d, ...updated, kitsAvailable: newKits } : d)));
        setActionSuccess(`✓ Restocked ${diag.testName}: now ${newKits} kits`);
      }
      setRestockingId(null);
      setTimeout(() => setActionSuccess(null), 3500);
    } catch (err: any) {
      setActionError(err.message || 'Failed to update stock');
      setTimeout(() => setActionError(null), 3500);
    }
  };

  // Handle Adding New Stock
  const handleCreateStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      if (activeTab === 'medicines') {
        if (!medName.trim() || !medGeneric.trim()) {
          throw new Error('Please provide both medicine name and generic name.');
        }

        const stockNum = parseInt(medStock, 10) || 0;
        const minNum = parseInt(medMinLevel, 10) || 10;

        const newMed = await createMedicine({
          name: medName.trim(),
          genericName: medGeneric.trim(),
          brand: medBrand.trim() || undefined,
          category: medCategory,
          dosageForm: medDosageForm,
          strength: medStrength.trim(),
          stock: stockNum,
          minStockLevel: minNum,
          expiryDate: medExpiry,
          facilityId: selectedFacility,
        });

        setMedicines((prev) => [newMed, ...prev]);
        setActionSuccess(`✓ Successfully added "${newMed.name}" (${stockNum} units) to PHC stock!`);
        // Reset form
        setMedName('');
        setMedGeneric('');
        setMedBrand('');
        setShowAddForm(false);
      } else {
        if (!diagName.trim()) {
          throw new Error('Please enter the diagnostic kit test name.');
        }

        const kitsNum = parseInt(diagKits, 10) || 0;
        const minNum = parseInt(diagMinLevel, 10) || 10;
        const code = `RDT-${diagName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

        const newKit = await createDiagnosticItem({
          code,
          testName: diagName.trim(),
          testNameHi: diagNameHi.trim() || undefined,
          category: diagCategory,
          kitsAvailable: kitsNum,
          minKitsLevel: minNum,
          expiryDate: diagExpiry,
          facilityId: selectedFacility,
        });

        setDiagnostics((prev) => [newKit, ...prev]);
        setActionSuccess(`✓ Successfully added "${newKit.testName}" (${kitsNum} kits) to PHC lab!`);
        setDiagName('');
        setDiagNameHi('');
        setShowAddForm(false);
      }

      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      setActionError(err.message || 'Failed to save new stock item.');
    } finally {
      setSubmitting(false);
    }
  };

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
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[92vh] overflow-hidden border border-gray-100">
        
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
                  Verify essential medicines and lab diagnostic test kits availability
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm((prev) => !prev)}
                className="px-3 py-1.5 bg-white text-emerald-800 hover:bg-emerald-50 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <span>{showAddForm ? '✕ Close Form' : '+ Add PHC Stock'}</span>
              </button>

              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer shrink-0"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
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

        {/* Action feedback banners */}
        {actionSuccess && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-5 py-2.5 text-xs text-emerald-800 font-semibold flex items-center justify-between animate-in fade-in">
            <span>{actionSuccess}</span>
            <button onClick={() => setActionSuccess(null)} className="text-emerald-600 hover:text-emerald-900 font-bold">×</button>
          </div>
        )}
        {actionError && (
          <div className="bg-red-50 border-b border-red-200 px-5 py-2.5 text-xs text-red-800 font-semibold flex items-center justify-between animate-in fade-in">
            <span>{actionError}</span>
            <button onClick={() => setActionError(null)} className="text-red-600 hover:text-red-900 font-bold">×</button>
          </div>
        )}

        {/* Tab switcher: Medicines vs Diagnostics */}
        <div className="px-5 pt-3 pb-2 bg-gray-50 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex p-1 bg-gray-200/80 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('medicines');
                  setShowAddForm(false);
                }}
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
                onClick={() => {
                  setActiveTab('diagnostics');
                  setShowAddForm(false);
                }}
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

          {/* Add Stock Form Panel */}
          {showAddForm && (
            <form onSubmit={handleCreateStock} className="mt-3 p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-3 animate-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between pb-1 border-b border-emerald-200/60">
                <span className="font-bold text-xs text-emerald-950 flex items-center gap-1.5">
                  <Icon name="plus" size={13} />
                  Add New {activeTab === 'medicines' ? 'Medicine to PHC Dispensary' : 'Diagnostic Kit to PHC Lab'}
                </span>
                <span className="text-[10px] text-emerald-700 font-medium">
                  Assigned to: {facilities.find(f => f.id === selectedFacility)?.name}
                </span>
              </div>

              {activeTab === 'medicines' ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">Medicine Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ciprofloxacin 500mg"
                      value={medName}
                      onChange={(e) => setMedName(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">Generic Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ciprofloxacin"
                      value={medGeneric}
                      onChange={(e) => setMedGeneric(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">Category</label>
                    <select
                      value={medCategory}
                      onChange={(e) => setMedCategory(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    >
                      <option value="Analgesic & Antipyretic">Analgesic & Antipyretic</option>
                      <option value="Antibiotic">Antibiotic</option>
                      <option value="Gastrointestinal & Hydration">Gastrointestinal & Hydration</option>
                      <option value="Antihypertensive & Cardiovascular">Antihypertensive & Cardio</option>
                      <option value="Antidiabetic">Antidiabetic</option>
                      <option value="Nutritional & Maternal">Nutritional & Maternal</option>
                      <option value="Respiratory">Respiratory</option>
                      <option value="Emergency Care">Emergency Care</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">Dosage Form</label>
                    <select
                      value={medDosageForm}
                      onChange={(e) => setMedDosageForm(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    >
                      <option value="Tablet">Tablet</option>
                      <option value="Capsule">Capsule</option>
                      <option value="Syrup">Syrup</option>
                      <option value="Injection">Injection</option>
                      <option value="Powder Sachet">Powder Sachet</option>
                      <option value="Inhaler">Inhaler</option>
                      <option value="Ointment">Ointment</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">Strength / Spec</label>
                    <input
                      type="text"
                      placeholder="e.g. 500mg, 100ml"
                      value={medStrength}
                      onChange={(e) => setMedStrength(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">Brand Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Ciplox / Generic"
                      value={medBrand}
                      onChange={(e) => setMedBrand(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">Initial Stock Units *</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={medStock}
                      onChange={(e) => setMedStock(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">Reorder Alert Level</label>
                    <input
                      type="number"
                      min="1"
                      value={medMinLevel}
                      onChange={(e) => setMedMinLevel(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">Expiry Date</label>
                    <input
                      type="date"
                      value={medExpiry}
                      onChange={(e) => setMedExpiry(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">Kit / Test Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Dengue NS1 Ag Rapid Test"
                      value={diagName}
                      onChange={(e) => setDiagName(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">Name in Hindi</label>
                    <input
                      type="text"
                      placeholder="e.g. डेंगू रैपिड टेस्ट किट"
                      value={diagNameHi}
                      onChange={(e) => setDiagNameHi(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">Category</label>
                    <select
                      value={diagCategory}
                      onChange={(e) => setDiagCategory(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    >
                      <option value="Rapid Diagnostic">Rapid Diagnostic</option>
                      <option value="Maternal & Antenatal">Maternal & Antenatal</option>
                      <option value="Infectious Disease">Infectious Disease</option>
                      <option value="Chronic & Metabolic">Chronic & Metabolic</option>
                      <option value="Biochemistry & Urine">Biochemistry & Urine</option>
                      <option value="Hematology">Hematology</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">Kits Available *</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={diagKits}
                      onChange={(e) => setDiagKits(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">Min Kits Alert Level</label>
                    <input
                      type="number"
                      min="1"
                      value={diagMinLevel}
                      onChange={(e) => setDiagMinLevel(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">Expiry Date</label>
                    <input
                      type="date"
                      value={diagExpiry}
                      onChange={(e) => setDiagExpiry(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 font-semibold"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {submitting ? 'Saving...' : `Save ${activeTab === 'medicines' ? 'Medicine' : 'Test Kit'} to Stock`}
                </button>
              </div>
            </form>
          )}

          {/* Search & Stock Filter */}
          <div className="mt-3 flex flex-col sm:flex-row gap-2 pb-1">
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
                <p className="text-gray-400 mt-1">Try adjusting your search query or click "+ Add PHC Stock" above.</p>
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
                          <span className="text-[10px] text-gray-400 font-mono">
                            {med.code}
                          </span>
                        </div>

                        <div className="text-[11px] text-gray-500 truncate">
                          {med.genericName}
                          {med.category && ` · ${med.category}`}
                        </div>

                        <div className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
                          <span>Form: <strong className="text-gray-600">{med.dosageForm}</strong></span>
                          {med.expiryDate && <span>Exp: {med.expiryDate}</span>}
                          {med.batch && <span>Batch: {med.batch}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        {isOut ? (
                          <div className="inline-flex flex-col items-end">
                            <span className="px-2.5 py-0.5 bg-red-100 text-red-800 border border-red-200 rounded-lg text-xs font-bold">
                              ✕ Out of Stock
                            </span>
                            <span className="text-[10px] text-red-600 font-medium mt-0.5">
                              Outside Sourcing Req.
                            </span>
                          </div>
                        ) : isLow ? (
                          <div className="inline-flex flex-col items-end">
                            <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold">
                              ⚠️ Low: {med.stock} units
                            </span>
                            <span className="text-[10px] text-amber-700 font-medium mt-0.5">
                              Alert Level: {med.minStockLevel}
                            </span>
                          </div>
                        ) : (
                          <div className="inline-flex flex-col items-end">
                            <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold">
                              ✓ Available: {med.stock}
                            </span>
                            <span className="text-[10px] text-emerald-700 font-medium mt-0.5">
                              Dispense at PHC
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Quick Restock Action Buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleQuickRestock(med, true, 10)}
                          title="Add 10 units"
                          className="px-2 py-1 bg-gray-100 hover:bg-emerald-100 hover:text-emerald-800 text-gray-700 text-[10px] font-bold rounded-lg border border-gray-200 transition-colors cursor-pointer"
                        >
                          +10
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickRestock(med, true, 50)}
                          title="Add 50 units"
                          className="px-2 py-1 bg-gray-100 hover:bg-emerald-100 hover:text-emerald-800 text-gray-700 text-[10px] font-bold rounded-lg border border-gray-200 transition-colors cursor-pointer"
                        >
                          +50
                        </button>
                      </div>
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
                <p className="text-gray-400 mt-1">Try adjusting your search query or click "+ Add PHC Stock" above.</p>
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

                        <div className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
                          <span>Code: <strong className="font-mono text-gray-600">{kit.code}</strong></span>
                          {kit.expiryDate && <span>Exp: {kit.expiryDate}</span>}
                          {kit.batch && <span>Batch: {kit.batch}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        {isOut ? (
                          <div className="inline-flex flex-col items-end">
                            <span className="px-2.5 py-0.5 bg-red-100 text-red-800 border border-red-200 rounded-lg text-xs font-bold">
                              ✕ Unavailable
                            </span>
                            <span className="text-[10px] text-red-600 font-medium mt-0.5">
                              Lab Testing Paused
                            </span>
                          </div>
                        ) : isLow ? (
                          <div className="inline-flex flex-col items-end">
                            <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold">
                              ⚠️ {kit.kitsAvailable} kits left
                            </span>
                            <span className="text-[10px] text-amber-700 font-medium mt-0.5">
                              Min Level: {kit.minKitsLevel}
                            </span>
                          </div>
                        ) : (
                          <div className="inline-flex flex-col items-end">
                            <span className="px-2.5 py-0.5 bg-teal-100 text-teal-800 border border-teal-200 rounded-lg text-xs font-bold">
                              ✓ {kit.kitsAvailable} kits ready
                            </span>
                            <span className="text-[10px] text-teal-700 font-medium mt-0.5">
                              Same-Day Lab Results
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Quick Restock Action Buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleQuickRestock(kit, false, 10)}
                          title="Add 10 kits"
                          className="px-2 py-1 bg-gray-100 hover:bg-teal-100 hover:text-teal-800 text-gray-700 text-[10px] font-bold rounded-lg border border-gray-200 transition-colors cursor-pointer"
                        >
                          +10
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickRestock(kit, false, 25)}
                          title="Add 25 kits"
                          className="px-2 py-1 bg-gray-100 hover:bg-teal-100 hover:text-teal-800 text-gray-700 text-[10px] font-bold rounded-lg border border-gray-200 transition-colors cursor-pointer"
                        >
                          +25
                        </button>
                      </div>
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

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadStock}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1"
            >
              <Icon name="sync" size={12} />
              Refresh
            </button>

            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-gray-900 hover:bg-black text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
