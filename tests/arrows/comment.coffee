###*
# Curried function that ends with a BEM CSS Selector
#
# @param {String} block - the BEM Block you'd like to select.
# @returns {Function}
###
export bem = (block) =>
  ###*
  # @param {String} [element] - the BEM Element within that block; if undefined, selects the block itself.
  # @returns {Function}
  ###
  (element) =>
    ###*
    # @param {?String} [modifier] - the BEM Modifier for the Block or Element; if undefined, selects the Block or Element unmodified.
    # @returns {String}
    ###
    (modifier) =>
      [
        ".",
        css(block),
        if element then "__#{css(element)}" else ""
        if modifier then "--#{css(modifier)}" else ""
      ].join("")

<FlatList
  renderItem={(
    info, # $FlowExpectedError - bad widgetCount type 6, should be Object
  ) => <span>{info.item.widget.missingProp}</span>}
  data={data}
/>
