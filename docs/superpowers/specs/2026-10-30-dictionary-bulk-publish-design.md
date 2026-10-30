# Bulk dictionary publishing

Select individual entries or all visible entries after filtering by topic. Publish the latest saved draft when present through existing adminSaveDictionaryEntry and DB validation. Process sequentially, report each failed word, retain failed selection, and refresh successful entries. Disable editing and competing actions while publishing. No automatic publication of unselected records.

Reuse the existing save RPC instead of adding a bulk endpoint; explicitly report partial success rather than pretending the operation is atomic.
