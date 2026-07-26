// Discount calculation logic — pure functions, no UI or side effects.

export function ruleMatchesItem(item, rule) {
  const normalise = (s) => s.trim().toLowerCase()
  if (rule.scope === 'brand') return normalise(item.brand) === normalise(rule.appliesTo)
  if (rule.scope === 'platform') return normalise(item.platform) === normalise(rule.appliesTo)
  return false
}

export function calculateDiscountAmount(price, rule) {
  if (rule.type === 'percentage') return Math.round(price * rule.value / 100)
  if (rule.type === 'flat') return rule.value
  return 0
}

function ruleToReasoning(rule) {
  const scopeLabel = rule.scope === 'brand' ? 'Brand' : 'Platform'
  if (rule.type === 'percentage') return `${scopeLabel} offer: ${rule.value}% off`
  if (rule.type === 'flat') return `${scopeLabel} offer: Rs.${rule.value} off`
  return `${scopeLabel} offer applied`
}

// Among matching non-stackable rules, the largest discount wins; stackable
// rules then apply on top of whatever price results from that.
export function applyDiscounts(item, rules) {
  const matchingRules = rules.filter((r) => ruleMatchesItem(item, r))

  if (matchingRules.length === 0) {
    return {
      itemId: item.itemId,
      product: item.product,
      brand: item.brand,
      platform: item.platform,
      basePrice: item.basePrice,
      finalPrice: item.basePrice,
      totalDiscount: 0,
      appliedRules: [],
      skippedRules: [],
      reasoning: 'No offers available',
    }
  }

  const nonStackable = matchingRules.filter((r) => !r.stackable)
  const stackable = matchingRules.filter((r) => r.stackable)

  let winner = null
  let skipped = []

  if (nonStackable.length > 0) {
    const sorted = [...nonStackable].sort(
      (a, b) =>
        calculateDiscountAmount(item.basePrice, b) -
        calculateDiscountAmount(item.basePrice, a)
    )
    winner = sorted[0]
    skipped = sorted.slice(1)
  }

  let price = item.basePrice
  const appliedRules = []
  const reasoningParts = []

  if (winner) {
    price -= calculateDiscountAmount(price, winner)
    appliedRules.push(winner.ruleId)
    reasoningParts.push(ruleToReasoning(winner))
  }

  for (const rule of stackable) {
    price -= calculateDiscountAmount(price, rule)
    appliedRules.push(rule.ruleId)
    reasoningParts.push(ruleToReasoning(rule))
  }

  const finalPrice = Math.round(price)

  return {
    itemId: item.itemId,
    product: item.product,
    brand: item.brand,
    platform: item.platform,
    basePrice: item.basePrice,
    finalPrice,
    totalDiscount: item.basePrice - finalPrice,
    appliedRules,
    skippedRules: skipped.map((r) => r.ruleId),
    reasoning: reasoningParts.join(' + '),
  }
}

export function processCart(cartItems, rules) {
  return cartItems.map((item) => applyDiscounts(item, rules))
}

export function cartTotal(results) {
  return results.reduce((sum, r) => sum + r.finalPrice, 0)
}

// Cart-level rule is checked against the sum of item-level final prices,
// after those are already computed — not against the original base prices.
export function applyCartLevelRule(results, rules) {
  const itemTotal = cartTotal(results)
  const cartRules = rules.filter((r) => r.scope === 'cart')
  const eligible = cartRules.filter((r) => itemTotal >= r.minCartValue)

  if (eligible.length === 0) {
    return { cartOffer: null, finalCartTotal: itemTotal }
  }

  const sorted = [...eligible].sort(
    (a, b) => calculateDiscountAmount(itemTotal, b) - calculateDiscountAmount(itemTotal, a)
  )
  const winner = sorted[0]
  const amountSaved = calculateDiscountAmount(itemTotal, winner)

  return {
    cartOffer: {
      ruleId: winner.ruleId,
      label: winner.type === 'percentage'
        ? `Cart offer: ${winner.value}% off`
        : `Cart offer: Rs.${winner.value} off`,
      amountSaved,
    },
    finalCartTotal: itemTotal - amountSaved,
  }
}

export function calculateCart(cartItems, rules) {
  const itemRules = rules.filter((r) => r.scope !== 'cart')
  const results = processCart(cartItems, itemRules)
  const { cartOffer, finalCartTotal } = applyCartLevelRule(results, rules)
  return { results, cartOffer, finalCartTotal }
}