const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Payment = sequelize.define('Payment', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    appointmentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('pending', 'succeeded', 'failed', 'refunded'),
      allowNull: false,
      defaultValue: 'pending',
    },
    // Cashfree's order_id — set at order-creation time, before payment happens.
    // (Renamed from stripeSessionId now that the payment provider is Cashfree,
    // not Stripe — same role: the identifier used to look up this Payment
    // when verifying the result.)
    providerOrderId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    // Cashfree's cf_payment_id — only known AFTER a successful payment
    // attempt, returned by PGOrderFetchPayments during verification. This is
    // the "Payment ID" shown in customer/admin payment history.
    providerPaymentId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  }, {
    tableName: 'payments',
    timestamps: true,
  });

  return Payment;
};
