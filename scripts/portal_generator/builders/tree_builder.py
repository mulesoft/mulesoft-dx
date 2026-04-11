"""
Hierarchical tree builder for API operations.

Builds a tree structure from URL path segments for sidebar navigation.
"""

from typing import Dict, List


def count_tree_operations(node: Dict) -> int:
    """Count all operations in a tree node and its descendants"""
    count = len(node.get('operations', []))
    for child in node.get('children', {}).values():
        count += count_tree_operations(child)
    return count


def build_operation_tree(operations: List[Dict]) -> Dict:
    """Build a hierarchical tree structure from operations"""
    tree = {}

    for op in operations:
        path = op['path']
        segments = [s for s in path.split('/') if s]

        # Navigate/create tree nodes
        current_node = tree
        current_path = ""

        for i, segment in enumerate(segments):
            current_path += '/' + segment

            # Create node if doesn't exist
            if segment not in current_node:
                current_node[segment] = {
                    'segment': segment,
                    'full_path': current_path,
                    'children': {},
                    'operations': []
                }

            # If last segment, add operation here
            if i == len(segments) - 1:
                current_node[segment]['operations'].append(op)

            # Move to children for next iteration
            current_node = current_node[segment]['children']

    return tree
