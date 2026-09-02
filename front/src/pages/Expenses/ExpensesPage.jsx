import React, { useState, useEffect } from 'react';
import { 
  Box, Typography, Card, CardContent, Grid, Button, 
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, 
  Chip, TextField, Dialog, DialogTitle, DialogContent, DialogActions,
  MenuItem, Select, FormControl, InputLabel, IconButton
} from '@mui/material';
import { Add as AddIcon, Receipt as ReceiptIcon, Check as CheckIcon, Close as CloseIcon } from '@mui/icons-material';

const ExpensesPage = ({ token, apiUrl }) => {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [openModal, setOpenModal] = useState(false);
  const [newExpense, setNewExpense] = useState({
    amount: '',
    currency: 'USD',
    category_id: '',
    description: '',
    receipt_url: ''
  });

  useEffect(() => {
    fetchData();
  }, [token, apiUrl]);

  const fetchData = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const [expRes, catRes] = await Promise.all([
        fetch(`${apiUrl}/api/expenses`, { headers }),
        fetch(`${apiUrl}/api/expenses/categories`, { headers })
      ]);

      if (expRes.ok) setExpenses(await expRes.json());
      if (catRes.ok) setCategories(await catRes.json());
    } catch (error) {
      console.error('Error fetching expenses:', error);
    }
  };

  const handleSubmit = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/expenses`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...newExpense,
          user_id: '1' // Defaulting to '1' for demo
        })
      });

      if (res.ok) {
        setOpenModal(false);
        fetchData();
        setNewExpense({ amount: '', currency: 'USD', category_id: '', description: '', receipt_url: '' });
      }
    } catch (error) {
      console.error(error);
    }
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'approved': return 'success';
      case 'reimbursed': return 'success';
      case 'rejected': return 'error';
      default: return 'warning';
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box display="flex" justifyContent="space-between" mb={3}>
        <div>
          <Typography variant="h4">Gastos Reembolsables</Typography>
          <Typography variant="body2" color="text.secondary">
            Los gastos aprobados se pagarán directamente en la nómina del empleado. No utilizar para órdenes de compra (Purchase Orders).
          </Typography>
        </div>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpenModal(true)}>
          Registrar Gasto
        </Button>
      </Box>

      <Grid container spacing={3}>
        {/* Summary Cards */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Total Pendiente</Typography>
              <Typography variant="h5">
                ${expenses.filter(e => e.status === 'pending').reduce((acc, curr) => acc + parseFloat(curr.amount), 0).toFixed(2)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Aprobado (Este Mes)</Typography>
              <Typography variant="h5">
                ${expenses.filter(e => e.status === 'approved').reduce((acc, curr) => acc + parseFloat(curr.amount), 0).toFixed(2)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Expenses List */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Fecha</TableCell>
                      <TableCell>Categoría</TableCell>
                      <TableCell>Descripción</TableCell>
                      <TableCell>Monto</TableCell>
                      <TableCell>Estado</TableCell>
                      <TableCell>Nómina</TableCell>
                      <TableCell>Recibo</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {expenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell>{new Date(expense.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>{expense.category_name || 'Sin categoría'}</TableCell>
                        <TableCell>{expense.description}</TableCell>
                        <TableCell>{expense.currency} {expense.amount}</TableCell>
                        <TableCell>
                          <Chip label={expense.status} color={getStatusColor(expense.status)} size="small" />
                        </TableCell>
                        <TableCell>
                            {expense.payroll_run_id ? (
                                <Chip label="Procesado en Nómina" color="info" size="small" variant="outlined" />
                            ) : (
                                <Typography variant="caption" color="text.secondary">Pendiente de pago</Typography>
                            )}
                        </TableCell>
                        <TableCell>
                          {expense.receipt_url && (
                            <IconButton size="small" href={expense.receipt_url} target="_blank">
                              <ReceiptIcon />
                            </IconButton>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {expenses.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} align="center">No hay gastos registrados</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* New Expense Modal */}
      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nuevo Gasto</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={6}>
              <TextField
                label="Monto"
                type="number"
                fullWidth
                value={newExpense.amount}
                onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Moneda"
                select
                fullWidth
                value={newExpense.currency}
                onChange={(e) => setNewExpense({...newExpense, currency: e.target.value})}
              >
                <MenuItem value="USD">USD</MenuItem>
                <MenuItem value="EUR">EUR</MenuItem>
                <MenuItem value="MXN">MXN</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Categoría</InputLabel>
                <Select
                  value={newExpense.category_id}
                  label="Categoría"
                  onChange={(e) => setNewExpense({...newExpense, category_id: e.target.value})}
                >
                  {categories.map((cat) => (
                    <MenuItem key={cat.id} value={cat.id}>{cat.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Descripción"
                fullWidth
                multiline
                rows={2}
                value={newExpense.description}
                onChange={(e) => setNewExpense({...newExpense, description: e.target.value})}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="URL del Recibo (Opcional)"
                fullWidth
                value={newExpense.receipt_url}
                onChange={(e) => setNewExpense({...newExpense, receipt_url: e.target.value})}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenModal(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} variant="contained">Enviar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ExpensesPage;
