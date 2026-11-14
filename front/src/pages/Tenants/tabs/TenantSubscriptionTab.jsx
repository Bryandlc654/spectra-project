import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { PLATFORM_ROLES } from '../../../lib/platformRoles';
import { useToast } from "../../../components/ToastProvider";
import Modal from "../../../components/Modal";
import { useI18n } from '../../../i18n/I18nContext';

export default function TenantSubscriptionTab({ company, api, reloadTenant }) {
  const { user } = useAuth();
  const isSupport = user?.platform_role === PLATFORM_ROLES.SUPPORT;
  const { id } = useParams();
  const toast = useToast();
  const { t, language } = useI18n();
  const locale = language === 'en' ? 'en-US' : 'es-ES';
  const [loading, setLoading] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [fetching, setFetching] = useState(true);
  
  // Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [formData, setFormData] = useState({
    plan_price: '',
    billing_cycle: 'monthly',
    platform_fee: ''
  });

  React.useEffect(() => {
    if (id) {
      fetchSubscription();
    }
  }, [id]);

  async function fetchSubscription() {
    try {
      const res = await api.get(`/api/tenants/${id}/subscription`);
      setSubscription(res.data);
    } catch (e) {
      console.error(e);
      toast.error(t('tenants.legacy.subscription.loadError'));
    } finally {
      setFetching(false);
    }
  }

  const isSuspended = company?.status === 'suspended';

  const formatAmount = (value) => new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));

  function translateStatus(status, prefix) {
    if (!status) return status;
    const key = `${prefix}.${status}`;
    const value = t(key);
    return value === key ? status : value;
  }

  async function handleToggleStatus() {
    if (!window.confirm(isSuspended ? t('tenants.legacy.subscription.reactivateConfirm') : t('tenants.legacy.subscription.suspendConfirm'))) return;
    
    setLoading(true);
    try {
      const action = isSuspended ? 'activate' : 'suspend';
      // We use the existing tenant suspend/activate endpoints
      await api.post(`/api/tenants/${id}/${action}`, { 
        reason: isSuspended ? t('tenants.legacy.subscription.reactivateReason') : t('tenants.legacy.subscription.suspendReason')
      });
      
      toast.success(isSuspended ? t('tenants.legacy.subscription.reactivated') : t('tenants.legacy.subscription.suspended'));
      reloadTenant();
    } catch (e) {
      toast.error(e.message || t('tenants.legacy.subscription.statusError'));
    } finally {
      setLoading(false);
    }
  }

  function handleEditPlan() {
    if (!subscription) return;
    setFormData({
      plan_price: subscription.plan.price,
      billing_cycle: subscription.plan.interval,
      platform_fee: subscription.plan.platform_fee || 0
    });
    setShowEditModal(true);
  }

  async function handleSavePlan(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.put(`/api/tenants/${id}/subscription`, formData);
      toast.success(t('tenants.legacy.subscription.updateSuccess'));
      setShowEditModal(false);
      fetchSubscription(); // Reload data
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || t('tenants.legacy.subscription.updateError'));
    } finally {
      setLoading(false);
    }
  }

  if (fetching) {
    return <div className="p-12 text-center text-slate-500">{t('tenants.legacy.subscription.loading')}</div>;
  }

  if (!subscription) {
    return <div className="p-12 text-center text-slate-500">{t('tenants.legacy.subscription.loadErrorInfo')}</div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900">{t('tenants.legacy.subscription.title')}</h2>
        <p className="text-slate-500">{t('tenants.legacy.subscription.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Plan & Status */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Current Plan Card */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-xs font-semibold tracking-wider text-brand uppercase mb-1">{t('tenants.legacy.subscription.currentPlan')}</div>
                  <h3 className="text-2xl font-bold text-slate-900">{subscription.plan.name}</h3>
                  <div className="mt-1 flex items-baseline gap-1">
                    {!isSupport ? (
                      <>
                        <span className="text-3xl font-extrabold text-slate-900">${formatAmount(subscription.plan.price)}</span>
                        <span className="text-slate-500">/ {subscription.plan.interval === 'monthly' ? t('tenants.legacy.subscription.perMonth') : t('tenants.legacy.subscription.perYear')}</span>
                      </>
                    ) : (
                      <span className="text-sm italic text-slate-500">{t('tenants.legacy.subscription.priceHidden')}</span>
                    )}
                  </div>
                  {Number(subscription.plan.platform_fee) > 0 && !isSupport && (
                     <div className="mt-1 text-sm text-slate-500">
                        + ${formatAmount(subscription.plan.platform_fee)} {t('tenants.legacy.subscription.platformFee')}
                     </div>
                  )}
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-bold border ${isSuspended ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                  {isSuspended ? t('tenants.legacy.subscription.statusSuspended') : t('tenants.legacy.subscription.statusActive')}
                </div>
              </div>

              <div className="mt-6 text-sm">
                <div>
                  <span className="block text-slate-500">{t('tenants.legacy.subscription.nextBilling')}</span>
                  <span className="font-medium text-slate-900">{subscription.plan.next_billing}</span>
                </div>
              </div>

              <div className="mt-8 flex gap-3">
                {!isSupport && (
                  <>
                    <button 
                      onClick={handleEditPlan}
                      className="flex-1 bg-slate-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-slate-800 transition"
                    >
                      {t('tenants.legacy.subscription.changePlan')}
                    </button>
                    <button 
                      onClick={handleToggleStatus}
                      disabled={loading}
                      className={`flex-1 px-4 py-2 rounded-lg font-medium border transition ${isSuspended ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50' : 'border-red-200 text-red-700 hover:bg-red-50'}`}
                    >
                      {isSuspended ? t('tenants.legacy.subscription.reactivate') : t('tenants.legacy.subscription.cancel')}
                    </button>
                  </>
                )}
                {isSupport && (
                   <div className="flex-1 p-3 bg-slate-50 text-slate-500 text-center rounded-lg text-sm italic">
                      {t('tenants.legacy.subscription.supportRestricted')}
                   </div>
                )}
              </div>
            </div>
            <div className="bg-slate-50 px-6 py-3 border-t border-slate-100">
              <p className="text-xs text-slate-500 text-center">
                {t('tenants.legacy.subscription.renewalNotice', { date: subscription.plan.next_billing })}
              </p>
            </div>
          </div>

          {/* Billing History */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-semibold text-slate-900">{t('tenants.legacy.subscription.billingHistory')}</h3>
              <button className="text-sm text-brand font-medium hover:underline">{t('tenants.legacy.subscription.viewAll')}</button>
            </div>
            <div className="divide-y divide-slate-100">
              {subscription.invoices.length === 0 ? (
                 <div className="p-6 text-center text-slate-500 text-sm">{t('tenants.legacy.subscription.noInvoices')}</div>
              ) : (
                subscription.invoices.map((inv) => (
                  <div key={inv.id} className="px-6 py-4 flex justify-between items-center hover:bg-slate-50 transition">
                    <div>
                      <div className="font-medium text-slate-900">{inv.date}</div>
                      <div className="text-xs text-slate-500">{t('tenants.legacy.subscription.invoiceNumber', { number: inv.invoice_number || inv.id })}</div>
                    </div>
                    <div className="flex items-center gap-4">
                      {!isSupport && (
                        <span className="font-medium text-slate-900">${formatAmount(inv.amount)}</span>
                      )}
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 capitalize">
                        {translateStatus(inv.status, 'tenants.legacy.subscription.invoiceStatus')}
                      </span>
                      <button className="p-2 text-slate-400 hover:text-slate-600">
                        <i className="bi bi-download"></i>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Edit Modal */}
      <Modal open={showEditModal} onClose={() => setShowEditModal(false)} title={t('tenants.legacy.subscription.editTitle')}>
        <form onSubmit={handleSavePlan} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('tenants.legacy.subscription.planPrice')}</label>
                <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-500">$</span>
                    <input 
                        type="number" 
                        step="0.01"
                        required
                        className="w-full pl-7 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent"
                        value={formData.plan_price}
                        onChange={(e) => setFormData({...formData, plan_price: e.target.value})}
                    />
                </div>
                <p className="text-xs text-slate-500 mt-1">{t('tenants.legacy.subscription.planPriceHint')}</p>
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('tenants.legacy.subscription.billingCycle')}</label>
                <select 
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent"
                    value={formData.billing_cycle}
                    onChange={(e) => setFormData({...formData, billing_cycle: e.target.value})}
                >
                    <option value="monthly">{t('tenants.legacy.subscription.monthly')}</option>
                    <option value="yearly">{t('tenants.legacy.subscription.yearly')}</option>
                </select>
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('tenants.legacy.subscription.platformFeeAdditional')}</label>
                <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-500">$</span>
                    <input 
                        type="number" 
                        step="0.01"
                        className="w-full pl-7 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent"
                        value={formData.platform_fee}
                        onChange={(e) => setFormData({...formData, platform_fee: e.target.value})}
                    />
                </div>
                <p className="text-xs text-slate-500 mt-1">{t('tenants.legacy.subscription.platformFeeHint')}</p>
            </div>

            <div className="flex justify-end gap-3 pt-4">
                <button 
                    type="button" 
                    onClick={() => setShowEditModal(false)}
                    className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition"
                >
                    {t('tenants.common.cancel')}
                </button>
                <button 
                    type="submit" 
                    disabled={loading}
                    className="bg-brand text-white px-4 py-2 rounded-lg font-medium hover:bg-brand-dark transition disabled:opacity-50"
                >
                    {loading ? t('tenants.common.saving') : t('tenants.legacy.subscription.saveChanges')}
                </button>
            </div>
        </form>
      </Modal>

    </div>
  );
}
