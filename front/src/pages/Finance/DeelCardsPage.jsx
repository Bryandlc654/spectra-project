import React, { useState, useEffect } from 'react';

const DeelCardsPage = ({ apiUrl, token, user }) => {
  const [cards, setCards] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);

  useEffect(() => {
    fetchCards();
  }, [apiUrl, token]);

  useEffect(() => {
    if (selectedCard) {
      fetchTransactions(selectedCard.id);
    }
  }, [selectedCard]);

  const fetchCards = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/cards?user_id=${user?.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCards(data.data || []);
        if (data.data && data.data.length > 0 && !selectedCard) {
          setSelectedCard(data.data[0]);
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async (cardId) => {
    try {
      const res = await fetch(`${apiUrl}/api/cards/${cardId}/transactions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.data || []);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleIssueCard = async (type) => {
    setIssuing(true);
    try {
      const res = await fetch(`${apiUrl}/api/cards`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type,
          limit: 1000.00,
          holder_name: `${user.first_name} ${user.last_name}`
        })
      });

      if (res.ok) {
        fetchCards();
        alert('Card issued successfully');
      } else {
        alert('Failed to issue card');
      }
    } catch (error) {
      console.error(error);
      alert('Error issuing card');
    } finally {
      setIssuing(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Deel Cards</h1>
        <div className="space-x-3">
          <button
            onClick={() => handleIssueCard('virtual')}
            disabled={issuing}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            + Virtual Card
          </button>
          <button
            onClick={() => handleIssueCard('physical')}
            disabled={issuing}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            + Physical Card
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10">Loading cards...</div>
      ) : cards.length === 0 ? (
        <div className="text-center py-20 bg-gray-50 rounded-lg">
          <p className="text-gray-500 mb-4">No cards found. Issue your first card to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Cards List */}
          <div className="space-y-4">
            {cards.map(card => (
              <div 
                key={card.id}
                onClick={() => setSelectedCard(card)}
                className={`p-4 rounded-xl shadow-md cursor-pointer transition-all ${
                  selectedCard?.id === card.id ? 'ring-2 ring-indigo-500 transform scale-105' : 'hover:bg-gray-50'
                } ${card.status === 'frozen' ? 'bg-gray-100' : 'bg-gradient-to-r from-gray-800 to-gray-900 text-white'}`}
              >
                <div className="flex justify-between items-start mb-8">
                  <span className="text-xs font-mono uppercase opacity-70">{card.type}</span>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${card.status === 'active' ? 'bg-green-500 text-white' : 'bg-gray-500 text-white'}`}>
                    {card.status}
                  </span>
                </div>
                <div className="mb-4">
                  <p className="font-mono text-xl tracking-widest">{card.card_number_masked}</p>
                </div>
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-xs opacity-70">Card Holder</p>
                    <p className="font-medium text-sm">{card.holder_name}</p>
                  </div>
                  <div>
                    <p className="text-xs opacity-70">Expires</p>
                    <p className="font-medium text-sm">{card.expiry_date}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Transactions */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-lg font-semibold">Transactions</h2>
              {selectedCard && (
                 <span className="text-sm text-gray-500">Limit: ${parseFloat(selectedCard.spending_limit).toFixed(2)}</span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Merchant</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {transactions.length === 0 ? (
                    <tr><td colSpan="4" className="text-center py-4 text-gray-500">No transactions found.</td></tr>
                  ) : (
                    transactions.map(tx => (
                      <tr key={tx.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(tx.transaction_date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {tx.merchant}
                          <span className="block text-xs text-gray-500">{tx.category}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          -${parseFloat(tx.amount).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            tx.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {tx.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeelCardsPage;
