import RdfLibTerm from './node-internal'
import { DefaultGraphTermType } from './types'
import { DefaultGraph as TFDefaultGraph } from './tf-types'

/** The RDF default graph */
export default class DefaultGraph extends RdfLibTerm implements TFDefaultGraph {
  termType: typeof DefaultGraphTermType = DefaultGraphTermType;

  constructor () {
    super('')
  }

  toCanonical () {
    return this.value
  }
}
