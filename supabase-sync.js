(function () {
  if (window.__mizzysbistroSupabaseInit) return;
  window.__mizzysbistroSupabaseInit = true;

  const supabaseUrl = "https://dgziewmbrpfhtvzipfir.supabase.co";
  const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRnemlld21icnBmaHR2emlwZmlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0NjY2NjcsImV4cCI6MjEwNzA0MjY2N30.W7cvY88x9XcOHkBUTQgSGz7StCyAh4AbBCrBz7afBbc";

  if (!window.supabase) {
    console.warn("Supabase SDK not loaded yet.");
    return;
  }

  const sb = window.supabase.createClient(supabaseUrl, supabaseKey);

  async function saveOrderToSupabase(order) {
    try {
      if (!order || !order.c || !order.lines) return;

      const { data: orderData, error: orderError } = await sb
        .from("orders")
        .insert([
          {
            total: order.c.tot,
            status: "completed"
          }
        ])
        .select()
        .single();

      if (orderError) {
        console.error("Order insert failed:", orderError);
        return;
      }

      const orderItems = order.lines.map(line => ({
        order_id: orderData.id,
        menu_item_id: line.id,
        item_name: line.n,
        quantity: line.q,
        unit_price: line.p
      }));

      const { error: itemError } = await sb
        .from("order_items")
        .insert(orderItems);

      if (itemError) {
        console.error("Order items failed:", itemError);
        return;
      }

      await sb
        .from("sales")
        .insert([
          {
            order_id: orderData.id,
            total: order.c.tot
          }
        ]);

      console.log("✅ Order synced to Supabase");
    } catch (err) {
      console.error("Supabase sync error:", err);
    }
  }

  function subscribeToOrderUpdates() {
    sb
      .channel("orders-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        console.log("Order update received");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => {
        console.log("Order item update received");
      })
      .subscribe();
  }

  const originalFinish = window.finish;

  if (typeof originalFinish === "function") {
    window.finish = function (...args) {
      const result = originalFinish.apply(this, args);

      try {
        const currentPay = window.pay;

        if (currentPay && currentPay.t && currentPay.c) {
          saveOrderToSupabase({
            lines: currentPay.t.lines || [],
            c: currentPay.c,
            pay: currentPay.list || []
          });
        }
      } catch (err) {
        console.error("Hook error:", err);
      }

      return result;
    };
  }

  subscribeToOrderUpdates();
})();
